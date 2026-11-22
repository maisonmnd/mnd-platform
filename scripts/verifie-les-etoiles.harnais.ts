/* VOS ÉTOILES, ÉPROUVÉES — `node scripts/verifie-les-etoiles.mjs`.

   22 novembre 2026 : « Parfois les clients sont pressés et n'ont pas le temps
   de laisser un commentaire. Construis la récupération d'avis Google
   intelligente », puis « easy, rapide et sans prise de tête. Laissez-nous vos
   étoiles, beauté. Stratégique, ça vient au bon moment ! » (Yéman).
   L'attente vient de ces phrases :
     - des étoiles, un bouton, rien à écrire ;
     - le bon moment : le soir même à l'heure des étoiles, jamais la nuit ;
     - un seul rappel, seulement si elle n'a pas touché son bouton ;
     - jamais touché : la Maison redemande à sa prochaine venue ;
     - le toucher se sait, et la page ne mène qu'au lien d'avis de la Maison.
   Jours et heures : des exemples, à l'heure de Cotonou (UTC + 1). */
import { readFileSync } from 'node:fs';
import {
  ETOILES_PAR_DEFAUT, FORME_DU_JETON_DES_ETOILES, HEURES_DES_ETOILES, MODELE_DES_ETOILES, MODELE_DU_RAPPEL_DES_ETOILES,
  bilanDesEtoiles, composantsDesEtoiles, departDesEtoiles, departDuRappelDesEtoiles, ditLeMomentDesEtoiles, jetonDesEtoiles,
  rappelDesEtoilesADeposer, reglagesDesEtoiles, texteDesEtoiles, texteDuRappelDesEtoiles,
} from '../src/shared/etoiles-pur';
import { JOURS_SI_JAMAIS_TOUCHEE, demandeDAvisPermise, ditLaDemandeDAvis } from '../src/shared/avis-fiches-pur';
import { JAMAIS_DEUX_FOIS_MS, REGISTRE_DES_MODELES } from '../src/shared/porte-des-modeles-pur';
import { DEVISE_COMPLETE } from '../src/shared/identite';

let ko = 0;
let n = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const a = JSON.stringify(attendu);
  const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK     ${nom}`);
  else { ko++; console.log(`ECHEC  ${nom} -> attendu ${a}, obtenu ${String(o)}`); }
};
const lis = (f: string): string => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const sansCommentaires = (f: string): string => lis(f).replace(/\/\*[\s\S]*?\*\//g, '');
/** Un instant à Cotonou : le 24 novembre 2026 (un mardi) à `h` heures, `j` jours plus tard. */
const T = (h: number, m = 0, j = 0): number => Date.UTC(2026, 10, 24 + j, h - 1, m, 0);
/** « J+0 19:00 », à Cotonou. */
const quand = (ms: number): string => {
  const d = new Date(ms + 3_600_000);
  return `J+${Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(2026, 10, 24)) / 86_400_000)} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};
const SALLE = { salleMin: 10, calmeDe: 20, calmeA: 8 };
const SOIR = ETOILES_PAR_DEFAUT;
const AUSSITOT = { ...ETOILES_PAR_DEFAUT, moment: 'aussitot' as const };

/* ── Les réglages ── */
dit('par defaut : le soir meme a 19 h, un rappel', { moment: 'soir', heure: 19, rappel: true }, reglagesDesEtoiles({}));
dit('les reglages de la Maison se lisent ; une heure hors de 9 h a 19 h 30 revient a 19 h', [
  { moment: 'aussitot', heure: 19, rappel: true }, { moment: 'soir', heure: 17, rappel: false }, { moment: 'soir', heure: 19, rappel: true }, { moment: 'soir', heure: 19, rappel: true },
], [reglagesDesEtoiles({ etoiles: { moment: 'aussitot' } }), reglagesDesEtoiles({ etoiles: { heure: 17, rappel: false } }),
  reglagesDesEtoiles({ etoiles: { heure: 22 } }), reglagesDesEtoiles(null)]);
dit('les heures proposees dans Parametres sont toutes hors des heures calmes', true, HEURES_DES_ETOILES.every((h) => h >= 9 && h <= 19.5 && reglagesDesEtoiles({ etoiles: { heure: h } }).heure === h));

/* ── Le bon moment ── */
dit('reglee a 11 h 10 : la demande part le soir meme a 19 h, pas dans l heure', 'J+0 19:00', quand(departDesEtoiles(T(11, 10), SOIR, SALLE)));
dit('reglee a 18 h 55 : 19 h est passe apres la salle d attente, elle part a 19 h 05', 'J+0 19:05', quand(departDesEtoiles(T(18, 55), SOIR, SALLE)));
dit('reglee a 19 h 55 : trop tard pour le soir, elle part le lendemain a 12 h 30, jamais a 8 h', 'J+1 12:30', quand(departDesEtoiles(T(19, 55), SOIR, SALLE)));
dit('« aussitot » : dix minutes de salle, a toute heure du jour', 'J+0 11:20', quand(departDesEtoiles(T(11, 10), AUSSITOT, SALLE)));
dit('« aussitot », reglee a 23 h : le lendemain a 12 h 30', 'J+1 12:30', quand(departDesEtoiles(T(23), AUSSITOT, SALLE)));
dit('une heure choisie a 17 h se tient', 'J+0 17:00', quand(departDesEtoiles(T(9), { ...SOIR, heure: 17 }, SALLE)));

/* ── Le rappel ── */
dit('le rappel part le lendemain a l heure des etoiles', ['J+1 19:00', 'J+1 19:00', 'J+2 19:00'],
  [quand(departDuRappelDesEtoiles(T(19), SOIR)), quand(departDuRappelDesEtoiles(T(19, 5), SOIR)), quand(departDuRappelDesEtoiles(T(12, 30, 1), SOIR))]);
dit('... jamais moins de vingt heures apres la demande : la porte des modeles le retiendrait', true,
  [T(19), T(19, 59), T(12, 30), T(17), T(9)].every((e) => departDuRappelDesEtoiles(e, SOIR) - e > JAMAIS_DEUX_FOIS_MS && departDuRappelDesEtoiles(e, { ...SOIR, heure: 17 }) - e > JAMAIS_DEUX_FOIS_MS));
const JETON = 'abcdefghjkmnpq';
const r = (o: Partial<Parameters<typeof rappelDesEtoilesADeposer>[0]> = {}) => rappelDesEtoilesADeposer({
  statut: 'envoyé', envoyeLe: new Date(T(19)).toISOString(), jeton: JETON, rappelDepose: false, maintenantMs: T(18, 30, 1), reglages: SOIR, salleMin: 10, ...o });
dit('le rappel se depose dans l heure qui precede son depart, pour 19 h le lendemain', 'J+1 19:00', quand(r() ?? 0));
dit('... pas la veille au soir, pas a midi, ni six heures apres son heure', [null, null, null], [r({ maintenantMs: T(19, 30) }), r({ maintenantMs: T(12, 0, 1) }), r({ maintenantMs: T(2, 0, 2) })]);
dit('... en retard d une heure, il part apres la salle d attente', 'J+1 20:10', quand(r({ maintenantMs: T(20, 0, 1) }) ?? 0));
dit('pas de rappel : bouton touche, deja depose, eteint, demande pas partie, ancien modele sans jeton', [null, null, null, null, null],
  [r({ toucheLe: new Date(T(19, 30)).toISOString() }), r({ rappelDepose: true }), r({ reglages: { ...SOIR, rappel: false } }), r({ statut: 'en-attente' }), r({ jeton: undefined })]);

/* ── Le bouton et son jeton ── */
const jeton = jetonDesEtoiles(Uint8Array.from({ length: 14 }, (_, i) => i * 37 + 5));
dit('le jeton : quatorze signes, la forme attendue, tire des octets donnes', [14, true, false, false],
  [jeton.length, FORME_DU_JETON_DES_ETOILES.test(jeton), FORME_DU_JETON_DES_ETOILES.test('abc'), FORME_DU_JETON_DES_ETOILES.test(`${jeton.slice(0, 13)}0`)]);
dit('le modele : {{1}} l appel, et UN bouton a adresse qui porte « e-<jeton> » ; aucune adresse ecrite ici', [
  { type: 'body', parameters: [{ type: 'text', text: 'Awa' }] },
  { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: `e-${JETON}` }] },
], composantsDesEtoiles('Awa', JETON));
dit('ses mots : « Laissez-nous vos etoiles, beaute », un toucher, rien a ecrire', [true, true, false],
  [texteDesEtoiles('Awa') === 'Bonjour Awa, laissez-nous vos étoiles, beauté. Un toucher suffit, rien à écrire.',
    texteDuRappelDesEtoiles('Awa') === 'Bonjour Awa, il reste vos étoiles, beauté. Un toucher suffit, rien à écrire.', /http|avis|commentaire/i.test(texteDesEtoiles('Awa') + texteDuRappelDesEtoiles('Awa'))]);
dit('les deux modeles ont leur nom', ['vos_etoiles', 'vos_etoiles_rappel'], [MODELE_DES_ETOILES, MODELE_DU_RAPPEL_DES_ETOILES]);

/* ── Jamais touché : la Maison redemande à sa prochaine venue ── */
const A = '2026-11-24';
dit('demandee il y a 35 jours, bouton jamais touche : on redemande a cette venue', { permise: true, pourquoi: 'jamais-touchee' },
  demandeDAvisPermise({ premiereVenue: false, derniereDemande: '2026-10-20', jamaisTouchee: true, aujourdhui: A }));
dit('... il y a dix jours : trop tot ; bouton touche : les six mois ; un avis laisse depuis : les six mois', ['trop-tot', 'trop-tot', 'trop-tot'], [
  demandeDAvisPermise({ premiereVenue: false, derniereDemande: '2026-11-14', jamaisTouchee: true, aujourdhui: A }).pourquoi,
  demandeDAvisPermise({ premiereVenue: false, derniereDemande: '2026-10-20', jamaisTouchee: false, aujourdhui: A }).pourquoi,
  demandeDAvisPermise({ premiereVenue: false, derniereDemande: '2026-10-20', dernierAvis: { jour: '2026-10-22', note: 5 }, jamaisTouchee: true, aujourdhui: A }).pourquoi,
]);
dit('un mois, et la fiche le dit', [30, true], [JOURS_SI_JAMAIS_TOUCHEE, ditLaDemandeDAvis({ permise: true, pourquoi: 'jamais-touchee' }, (j) => j).includes('jamais touché le bouton')]);

/* ── Le bilan ── */
const E = (o: Record<string, unknown>) => ({ type: 'avis-google', statut: 'envoyé', quand: '2026-11-24T18:00:00.000Z', jeton: JETON, ...o });
dit('le bilan du mois : les demandes a bouton, lues, touchees, et les rappels a part', { demandees: 3, lues: 2, touchees: 1, rappels: 1 },
  bilanDesEtoiles([E({ etat: 'lu', toucheLe: '2026-11-24T18:20:00.000Z' }), E({ etat: 'lu' }), E({ etat: 'remis' }), E({ rappelDe: 'env-x-wa-avis' }),
    E({ jeton: undefined }), E({ statut: 'en-attente' }), E({ quand: '2026-10-30T18:00:00.000Z' }), { type: 'rappel', statut: 'envoyé', quand: '2026-11-24T18:00:00.000Z', jeton: JETON }], '2026-11-01'));
dit('la phrase des Parametres', ['La demande part le soir même à 19 h. Un seul rappel le lendemain, si elle n’a pas touché son bouton.', 'La demande part dès que sa facture est réglée. Aucun rappel.'],
  [ditLeMomentDesEtoiles(SOIR), ditLeMomentDesEtoiles({ ...AUSSITOT, rappel: false })]);

/* ── La fonction : la copie, le toucher, le rappel ── */
const bloc = (t: string): string => (t.match(/\/\* ⟨etoiles⟩ \*\/[\s\S]*?\/\* ⟨\/etoiles⟩ \*\//) ?? [''])[0];
const fn = lis('supabase/functions/avis-google/index.ts');
const f = sansCommentaires('supabase/functions/avis-google/index.ts');
dit('la fonction porte la regle, caractere pour caractere', [true, true], [bloc(lis('src/shared/etoiles-pur.ts')).length > 2000, bloc(lis('src/shared/etoiles-pur.ts')) === bloc(fn)]);
dit('le toucher passe AVANT la porte du cron, et seulement pour l action « etoiles »', [true, true],
  [f.indexOf("demande.action === 'etoiles') return await leToucherDesEtoiles(req, demande.jeton);") > 0
    && f.indexOf("demande.action === 'etoiles') return await leToucherDesEtoiles(req, demande.jeton);") < f.indexOf("return new Response(JSON.stringify({ erreur: 'réservé au cron' }), { status: 401 });"),
  f.includes("if (!service || !memeCle(cleRecue, service)) {")]);
dit('le toucher : un jeton a la bonne forme, un frein, et UN seul lien rendu, celui de la Maison', [true, true, true, true, false], [
  f.includes("if (!FORME_DU_JETON_DES_ETOILES.test(jeton)) return rend({ erreur: 'lien' }, 400);"),
  f.includes("if (!errFrein && (count ?? 0) >= 30) return rend({ erreur: 'trop' }, 429);"),
  f.includes("if (!lignes || lignes.length === 0) return rend({ erreur: 'lien' }, 404);"),
  f.includes("const lien = String((docs?.[0]?.data as { reviewLink?: unknown } | undefined)?.reviewLink ?? '').trim() || REVIEW_LINK_DEFAUT;") && f.includes('return rend({ ok: true, lien });'),
  /lien: (demande|recu|req)\b/.test(f),
]);
dit('... il note le toucher, et ecarte le rappel encore en salle', [true, true], [
  f.includes(': { ...d, toucheLe: le };'), f.includes("? { ...d, statut: 'écarté', ecartePar: 'la Maison, automatiquement', ecarteLe: le, detail: 'elle a touché son bouton avant le rappel' }")]);
dit('la demande part a l heure des etoiles, avec le modele neuf et son jeton quand Meta l a approuve, l ancien en repli', [true, true, true, true], [
  f.includes('const partDesEtoiles = departDesEtoiles(Date.now(), etoiles, regles);'),
  f.includes("? { genre: 'whatsapp', numero: tel, modele: WA_TEMPLATE_ETOILES, parQui: 'la Maison, automatiquement', texteAuFil: texteDesEtoiles(prenom), composants: composantsDesEtoiles(prenom, jeton), repli: ancienModele }"),
  f.includes("consigne(p, 'en-attente', undefined, { ...depot(Date.now(), regles, colisDeLAvis, prenom, partDesEtoiles), ...plusDesEtoiles });"),
  f.includes('const jeton = jetonDesEtoiles(crypto.getRandomValues(new Uint8Array(14)));')
    && f.includes('const plusDesEtoiles: Record<string, unknown> = WA_TEMPLATE_ETOILES ? { jeton } : {};')
    && f.includes("if (r.ok) { consigne(p, 'envoyé', undefined, plusDesEtoiles); nWa++; }"),
]);
dit('le rappel : son modele approuve, la salle ouverte, le meme jeton, une ligne a part, l arret d avance respecte', [true, true, true, true], [
  f.includes('if (WA_TEMPLATE_RAPPEL && etoiles.rappel && salleOuverte) {'),
  f.includes("texteAuFil: texteDuRappelDesEtoiles(prenom), composants: composantsDesEtoiles(prenom, String(x.d.jeton)),"),
  f.includes('const id = `${x.id}-2`;') && f.includes('rappelDe: x.id, jeton: x.d.jeton,'),
  f.includes("const dAvanceR = laPorteDAvance({ id, type: 'avis-google', invoiceId: x.d.invoiceId, colis }, avanceDuDepot);"),
]);
dit('la regle « jamais touchee » arrive a la demande', [true, true], [
  f.includes("jamaisTouchee: jamaisToucheeDe.get(p.clientId!) === true,"), f.includes("const sansToucher = typeof e.jeton === 'string' && e.jeton !== '' && !e.toucheLe;")]);
dit('la version dit ce lot', true, f.includes("const VERSION = '2026-11-22-a · vos étoiles"));

/* ── La page du bouton ── */
const payer = lis('public/payer.html');
dit('payer.html : « tg=e-<jeton> » mene a la page des etoiles, et ne passe pas pour un Tap & Go', [true, true], [
  payer.includes("var ej = (p.get('tg') || '').match(/^e-([23456789abcdefghjkmnpqrstuvwxyz]{14})$/);\n  if (ej) location.replace('regler.html?e=' + ej[1]);"),
  payer.includes("if (p.has('tg') && !rj && !ej) {")]);
const page = sansCommentaires('src/apps/regler/Etoiles.tsx');
const client = sansCommentaires('src/shared/etoiles-serveur.ts');
dit('la page : le toucher part, Google s ouvre, le bouton reste si rien ne s ouvre ; un lien faux le dit', [true, true, true, true], [
  sansCommentaires('src/apps/regler/main.tsx').includes('{etoiles !== null ? <Etoiles jeton={etoiles} /> : auComptoir ? <Comptoir /> : <App />}'),
  page.includes('window.location.replace(r.lien);') && page.includes('<a className="rg-regler" href={etat.lien}'),
  page.includes("if (!FORME_DU_JETON_DES_ETOILES.test(jeton)) { setEtat({ k: 'perdu' }); return; }"),
  page.includes('Laissez-nous vos étoiles, beauté.') && page.includes('Un toucher suffit, rien à écrire.'),
]);
dit('... elle n ouvre qu une adresse en https, et n emporte pas l ERP', [true, false], [
  client.includes("const lien = typeof j.lien === 'string' && j.lien.startsWith('https://') ? j.lien : '';"),
  /shared\/(identite|sync|supabase|finance|store)'/.test(lis('src/apps/regler/Etoiles.tsx') + lis('src/shared/etoiles-serveur.ts') + lis('src/shared/etoiles-pur.ts'))]);
dit('... et dit la devise de la Maison, mot pour mot', DEVISE_COMPLETE, /const DEVISE = '([^']+)';/.exec(lis('src/apps/regler/Etoiles.tsx'))?.[1]);

/* ── Les registres et le Trône ── */
const entree = REGISTRE_DES_MODELES.find((e) => e.famille === 'avis-google');
dit('la porte des modeles connait les trois modeles et leurs secrets ; un par tete', [['avis_google', 'vos_etoiles', 'vos_etoiles_rappel'], ['WA_TEMPLATE_AVIS', 'WA_TEMPLATE_ETOILES', 'WA_TEMPLATE_ETOILES_RAPPEL'], true, 1],
  [entree?.modeles, entree?.secrets, entree?.unParTete, entree?.appel]);
const prm = sansCommentaires('src/apps/trone/routes/systeme/Parametres.tsx');
dit('Parametres : l heure des etoiles et le rappel se reglent, lus comme la fonction les lit', [true, true, true], [
  prm.includes('const etoilesCfg = reglagesDesEtoiles(autoCfgRaw);'),
  prm.includes("{HEURES_DES_ETOILES.map((h) => <option key={h} value={String(h)}>Le soir même à {heureDite(h)}</option>)}"),
  prm.includes("etoiles: { ...etoilesCfg, rappel: e.target.value === 'oui' }")]);
dit('la rubrique des avis compte les boutons touches du mois', true,
  sansCommentaires('src/apps/trone/routes/clients/LesAvis.tsx').includes('const etoilesDuMois = useMemo(() => bilanDesEtoiles(envois as readonly DemandeDEtoilesLue[], `${mois}-01`), [envois, mois]);'));

console.log(ko ? `\n${ko} ECHEC(S) sur ${n}.` : `\n${n}/${n} epreuves : vos étoiles.`);
if (ko) process.exitCode = 1;
