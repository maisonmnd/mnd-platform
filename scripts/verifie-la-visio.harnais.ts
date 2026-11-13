/* LA VISIO DE QUINZE MINUTES, ÉPROUVÉE — `node scripts/verifie-la-visio.mjs`.

   13 novembre 2026 (la Consultation, lot 3). Les règles de la visio
   (visio-pur : créneaux à l'heure de Cotonou, phases, compte à rebours,
   lien d'entrée, résumé en trois touches), le devis ferme de la consultation
   privée, le prix tenu au même nombre en trois endroits, et les branchements :
   la fonction visio-salle, la migration 0209, la salle dans Ma Couronne, les
   deux portes du site, les files B et C du Trône. Sortie ASCII : la console
   de Windows. */
import {
  REGLAGES_DE_DEPART, anneauAllume, cheminDeLaSalle, creneauDit, creneauValide, creneauxOuverts, ecouleDit, heureDite,
  instantDeCotonou, jourDit, lectureDite, minutesSecondes, parJour, phaseDe, priveeObligatoire, reglagesSurs, resteS,
  resumeSur, salleDuFragment, suiteRetenue, numeroCourt,
} from '../src/shared/visio-pur';
import { deductionDeLaConsultation, motDuDevisFerme } from '../src/shared/devis-de-la-consultation-pur';
import { PRIX_DE_LA_CONSULTATION_PRIVEE_XOF } from '../src/shared/estimation-pur';
import type { OnlineConsultation } from '../src/shared/bridges';
import { readFileSync } from 'node:fs';

let n = 0;
const ascii = (v: unknown): string =>
  (JSON.stringify(v) ?? 'undefined').replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) process.exitCode = 1;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : ` -> ${ascii(obtenu)}`}`);
  if (!ok) console.log(`       attendu ${ascii(attendu)}`);
};
const lf = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

/* ── ① LES RÉGLAGES ──────────────────────────────────────────────────── */
dit('les reglages de depart : eteints, mardi a samedi, quatre quarts d heure', [false, [2, 3, 4, 5, 6], ['10:00', '10:15', '10:30', '10:45']],
  [REGLAGES_DE_DEPART().actif, REGLAGES_DE_DEPART().jours, REGLAGES_DE_DEPART().heures]);
const sale = reglagesSurs({ actif: 'oui', jours: [9, 2, 2, '3'], heures: ['25:00', '09:30', '9:00', '09:30'], horizonJours: 400, delaiMin: -5, parTelephone: 0 });
dit('des reglages sales sont rendus surs', [false, [2, 3], ['09:30'], 30, 0, 1], [sale.actif, sale.jours, sale.heures, sale.horizonJours, sale.delaiMin, sale.parTelephone]);

/* ── ② L'HEURE DE COTONOU ET LES CRÉNEAUX ───────────────────────────── */
dit('10:15 a Cotonou, c est 09:15 UTC', '2026-11-17T09:15:00.000Z', instantDeCotonou('2026-11-17', '10:15'));
dit('et l heure se redit a Cotonou', '10:15', heureDite('2026-11-17T09:15:00.000Z'));
dit('le jour se dit avec son annee', 'mardi 17 novembre 2026', jourDit('2026-11-17'));
dit('le creneau se dit en entier', 'mardi 17 novembre 2026 · 10:15', creneauDit('2026-11-17T09:15:00.000Z'));
const R = { ...REGLAGES_DE_DEPART(), actif: true };
const lundi8h = Date.parse('2026-11-16T07:00:00.000Z'); // lundi 16 novembre, 08:00 a Cotonou
const tous = creneauxOuverts(R, lundi8h, []);
dit('sept jours, du mardi au samedi : vingt quarts d heure', [20, '2026-11-17T09:00:00.000Z', '2026-11-17T09:15:00.000Z'], [tous.length, tous[0]?.debut, tous[0]?.fin]);
dit('un quart d heure pris disparait', 19, creneauxOuverts(R, lundi8h, ['2026-11-17T09:15:00.000Z']).length);
const mardi9h = Date.parse('2026-11-17T08:00:00.000Z'); // mardi 09:00, delai de 120 min
dit('rien a moins de deux heures : le mardi matin est passe', '2026-11-18', parJour(creneauxOuverts(R, mardi9h, []))[0]?.jour);
dit('le serveur revalide : libre, pris, hors grille', [true, false, false], [
  creneauValide(R, lundi8h, [], '2026-11-17T09:30:00.000Z'),
  creneauValide(R, lundi8h, ['2026-11-17T09:30:00.000Z'], '2026-11-17T09:30:00.000Z'),
  creneauValide(R, lundi8h, [], '2026-11-17T09:20:00.000Z'),
]);
dit('le dimanche et le lundi restent fermes', false, tous.some((c) => ['2026-11-22', '2026-11-16', '2026-11-23'].includes(c.debut.slice(0, 10))));

/* ── ③ LES PHASES ET LE COMPTE À REBOURS ────────────────────────────── */
const D = Date.parse('2026-11-17T09:15:00.000Z');
const F = Date.parse('2026-11-17T09:30:00.000Z');
const a = (hms: string) => Date.parse(`2026-11-17T${hms}.000Z`);
dit('les phases : attente, ouverte cinq minutes avant, echange, rebours a 13:00, fermee a 15:00',
  ['attente', 'ouverte', 'echange', 'echange', 'rebours', 'fermee'],
  [a('09:09:59'), a('09:10:00'), a('09:15:00'), a('09:27:59'), a('09:28:00'), a('09:30:00')].map((t) => phaseDe(D, F, t)));
dit('a 13:36, il reste 1:24 et l anneau est aux sept dixiemes', ['13:36', 84, '1:24', 0.7], [ecouleDit(D, a('09:28:36')), resteS(F, a('09:28:36')), minutesSecondes(resteS(F, a('09:28:36'))), anneauAllume(84)]);
dit('l horloge ne depasse jamais 15:00, l anneau s eteint a zero', ['15:00', 0, 1], [ecouleDit(D, a('09:45:00')), anneauAllume(0), anneauAllume(600)]);

/* ── ④ LE LIEN D'ENTRÉE ─────────────────────────────────────────────── */
const J = 'A'.repeat(16) + 'b_c-'.repeat(4);
dit('le lien d entree se lit, et rien d autre', [{ id: 'vz-abc123def456', jeton: J }, null, null, null], [
  salleDuFragment(cheminDeLaSalle('vz-abc123def456', J).replace('/couronne/', '')),
  salleDuFragment('#/visio/vz-abc123def456.court'),
  salleDuFragment(`#/visio/rdv-1.${J}`),
  salleDuFragment(`#/rdv/vz-abc123def456.${J}`),
]);
dit('le chemin reste relatif a l origine (aucun domaine)', true, cheminDeLaSalle('vz-abc123def456', J).startsWith('/couronne/#/visio/'));
dit('le numero se reduit a ses huit derniers chiffres', ['97123456', '97123456'], [numeroCourt('+229 01 97 12 34 56'), numeroCourt('0197123456')]);

/* ── ⑤ LE RÉSUMÉ EN TROIS TOUCHES ───────────────────────────────────── */
dit('la privee s impose des la reparation intensive', [false, true, true, 'privee', 'soins'],
  [priveeObligatoire('essentielle'), priveeObligatoire('intensive'), priveeObligatoire('alala'), suiteRetenue({ niveau: 'intensive', suite: 'soins' }), suiteRetenue({ niveau: 'douce', suite: 'soins' })]);
dit('un resume sale est nettoye', { niveau: 'intensive', estimationXof: 90000 }, resumeSur({ niveau: 'intensive', longueur: 'immense', suite: 'peut-etre', estimationXof: '90000', mot: '   ' }));
dit('la lecture se dit pour elle', ['Réparation intensive · locks mi-longues', 'ÀLÀLÀ™ · Repose partielle et reconstruction complète'],
  [lectureDite({ niveau: 'intensive', longueur: 'mi-longue' }), lectureDite({ niveau: 'alala' })]);

/* ── ⑥ LE DEVIS FERME ET LE PRIX ────────────────────────────────────── */
const C = { id: 'cg-1', paidXof: 15000, client: { name: 'Awa', phone: '97000000', city: '', currency: 'XOF' } } as unknown as OnlineConsultation;
const argent = (x: number) => `${x} F`;
dit('la consultation reglee est deduite, nommee, jamais en ligne negative', [{ globalDiscountXof: 15000, discountLabel: 'Consultation privée, déduite' }, null],
  [deductionDeLaConsultation(C), deductionDeLaConsultation({ ...C, paidXof: 0 })]);
dit('le mot du devis ferme dit la deduction', true, motDuDevisFerme(C, argent).includes('Les 15000 F de la consultation sont déduits.'));
const fee = /export const FEE_XOF = (\d+);/.exec(lf('src/apps/consultation/data.ts'))?.[1];
const serveur = /CONSULTATION_FEE_XOF'\) \?\? (\d+)\)/.exec(lf('supabase/functions/kkiapay-verify/index.ts'))?.[1];
dit('le prix de la privee : le meme nombre au site, au tunnel et au serveur', [15000, '15000', '15000'], [PRIX_DE_LA_CONSULTATION_PRIVEE_XOF, fee, serveur]);

/* ── ⑦ LA FONCTION ──────────────────────────────────────────────────── */
const fn = lf('scripts/serveur/visio-salle.ts');
dit('la salle se ferme chez Daily : fin fixee, ejection a la fin, jetons qui expirent', [true, true, true], [
  /exp, eject_at_room_exp: true/.test(fn), /eject_at_token_exp: true/.test(fn), /privacy: 'private'/.test(fn),
]);
dit('le jeton n est garde qu en empreinte', [true, false], [/jeton_hash: await empreinte\(jeton\)/.test(fn), /insert\(\{[^}]*\bjeton,/.test(fn)]);
dit('aucun secret ni domaine ecrit : tout vient de l environnement', [true, false], [
  /Deno\.env\.get\('DAILY_API_KEY'\)/.test(fn), /supabase\.co|maisonmnd|github\.io|sk_live|daily\.co\/[a-z]/i.test(fn.replace("const DAILY = 'https://api.daily.co/v1';", '')),
]);
dit('la reservation est limitee et revalidee au serveur', [true, true, true], [/await permis\(sb, ipDe\(req\)\)/.test(fn), /creneauValide\(r, maintenant/.test(fn), /r\.parTelephone/.test(fn)]);
dit('l entree de la Maison demande une session de l equipe', true, /geste === 'entrer-maison'[\s\S]{0,120}delEquipe\(sb, req\)/.test(fn));
dit('le resume ne se lit qu une fois la salle fermee', true, /const fermee = Date\.now\(\) >= Date\.parse\(l\.fin\);/.test(fn));

/* ── ⑧ LA MIGRATION 0209 ────────────────────────────────────────────── */
const sql = lf('supabase/migrations/0209_la_visio_de_quinze_minutes.sql');
dit('0209 : la table, un quart d heure une seule fois, la RLS, rien pour le public', [true, true, true, false], [
  /create table if not exists public\.visios/.test(sql),
  /create unique index if not exists \w+ on public\.visios \(debut\) where statut <> 'annulée'/.test(sql),
  /alter table public\.visios enable row level security/.test(sql),
  /to anon|for insert to authenticated[\s\S]{0,40}visios/.test(sql.split('-- ── ② ')[0]),
]);
dit('0209 : le compartiment des temoins est prive, la direction ecrit mnd_visio', [true, true], [
  /values \('temoins', 'temoins', false/.test(sql), /array\['mnd_besoins', 'mnd_visio'\]/.test(sql),
]);

/* ── ⑨ LES BRANCHEMENTS ─────────────────────────────────────────────── */
const app = lf('src/apps/couronne/App.tsx');
const salle = lf('src/apps/couronne/SalleDeVisio.tsx');
dit('Ma Couronne ouvre la salle par le lien, avant la connexion', [true, true], [
  /salle \? <SalleDeVisio id=\{salle\.id\} jeton=\{salle\.jeton\} \/> : <LaCouronne \/>/.test(app), /function LaCouronne\(\) \{\n  const \{ session, loading \} = useAuth\(\);/.test(app),
]);
dit('la salle suit l heure du serveur et laisse la camera et le micro', [true, true, true], [
  /decalage\.current = m - Date\.now\(\)/.test(salle), /allow="camera; microphone;/.test(salle), /phase === 'fermee'\) setEntree\(null\)/.test(salle),
]);
const portes = lf('src/apps/revelateur/ilots/PortesDeLaConsultation.tsx');
const ilot = lf('src/apps/revelateur/ilots/Consultation.tsx');
dit('les deux portes du site : la visio par la fonction, la privee verifiee au serveur', [true, true, true], [
  /appelle\('visio-salle', \{ geste: 'reserver'/.test(portes),
  /appelle\('kkiapay-verify', \{ transactionId, apptId: '', consultationId: depot\.id, expectedXof: prix, branchId \}\)/.test(portes),
  /<PortesDeLaConsultation depot=\{depot\}/.test(ilot) && /get\('privee'\)/.test(ilot),
]);
dit('les portes n importent ni magasin ni synchronisation', false, /from '\.\.\/\.\.\/\.\.\/shared\/(besoins|sync|store|pricing|catalog|kkiapay|finance)'/.test(portes));
const consultations = lf('src/apps/trone/routes/clients/Consultations.tsx');
dit('les files A, B et C sont au Trone, dans cet ordre', true, /<ConsultationsGratuites \/>\n\s*<ConsultationsVisios \/>\n\s*<ConsultationsReglees \/>/.test(consultations));
dit('une consultation reglee quitte la file A pour la file C', [true, true], [
  /!\(o\.paidXof > 0\)/.test(lf('src/apps/trone/routes/clients/ConsultationsGratuites.tsx')),
  /o\.modalite === 'auto' && o\.paidXof > 0 && o\.status !== 'fermée'/.test(lf('src/apps/trone/routes/clients/ConsultationsReglees.tsx')),
]);
dit('le devis ferme : a valider par elle, la consultation deduite', true,
  /const ferme = params\.get\('ferme'\) === '1';[\s\S]{0,600}status: ferme \? 'à valider' : 'estimé',\n\s*\.\.\.\(ferme \? \{ aValiderPar: 'cliente' as const \} : \{\}\)/.test(lf('src/apps/trone/routes/vente/Factures.tsx')));
dit('les reglages de la visio : un onglet, ferme a qui n est pas de la direction', [true, true], [
  /onglet === 'visio' && <ReglagesDeLaVisio estDirection=\{estDirection\} \/>/.test(lf('src/apps/trone/routes/systeme/BesoinsEtRegles.tsx')),
  /<fieldset disabled=\{!estDirection\}/.test(lf('src/apps/trone/routes/systeme/ReglagesDeLaVisio.tsx')),
]);

/* ── ⑩ LA CHARTE ────────────────────────────────────────────────────── */
const NEUFS = [
  'src/apps/couronne/SalleDeVisio.tsx', 'src/apps/couronne/visio.css', 'src/apps/trone/routes/clients/ConsultationsVisios.tsx',
  'src/apps/trone/routes/clients/ConsultationsReglees.tsx', 'src/apps/trone/routes/clients/visios.css',
  'src/apps/trone/routes/systeme/ReglagesDeLaVisio.tsx', 'src/apps/revelateur/ilots/PortesDeLaConsultation.tsx', 'src/shared/visio-pur.ts',
];
const textes = NEUFS.map(lf);
dit('aucun emoji dans les fichiers neufs', [], NEUFS.filter((_, i) => /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(textes[i])));
dit('ni obsidienne, ni rayon au-dela de 4 px', [[], []], [
  NEUFS.filter((_, i) => /obsidian/i.test(textes[i])),
  NEUFS.flatMap((f, i) => [...textes[i].matchAll(/border-?[rR]adius:\s*'?(\d+)/g)].filter((m) => Number(m[1]) > 4).map(() => f)),
]);

console.log(`\n${n} verifications.`);
if (process.exitCode) console.log('ECHEC : la visio ne tient pas ses promesses.');
else console.log('TOUT VA BIEN : la visio tient ses promesses.');
