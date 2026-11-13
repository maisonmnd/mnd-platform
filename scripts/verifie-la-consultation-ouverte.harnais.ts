/* LA CONSULTATION OUVERTE, ÉPROUVÉE — `node scripts/verifie-la-consultation-ouverte.mjs`.

   13 novembre 2026 (la Consultation, lot 2). Les fourchettes de l'estimation
   (estimation-pur), le devis estimé né d'une consultation
   (devis-de-la-consultation-pur), et les branchements : la page du site,
   l'îlot, le dépôt par push-notify, la file A du Trône, la migration 0208.
   Les prix sont des exemples. Sortie ASCII : la console de Windows. */
import { bornesDesCalibres, calibreDuNombre, fourchetteDe, somme, proposableEnLigne, type PrestationBrute } from '../src/shared/estimation-pur';
import { clienteDeLaConsultation, lignesDuDevisEstime, motDuDevisEstime } from '../src/shared/devis-de-la-consultation-pur';
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

/* ── ① LES CALIBRES ──────────────────────────────────────────────────── */
const CAL = [
  { id: 'cal-medium', name: 'Medium', maxLocks: 150 }, { id: 'cal-jumbo', name: 'Jumbo', maxLocks: 80 },
  { id: 'cal-micro', name: 'Micro', maxLocks: 350 }, { id: 'cal-mini', name: 'Mini', maxLocks: 250 }, { id: 'cal-galaxy', name: 'Galaxy', maxLocks: null },
];
dit('les calibres se rangent et se bornent', [['cal-jumbo', 1, 80], ['cal-medium', 81, 150], ['cal-mini', 151, 250], ['cal-micro', 251, 350], ['cal-galaxy', 351, 650]],
  bornesDesCalibres(CAL).map((b) => [b.id, b.min, b.max]));
dit('le calibre d un nombre de locks', ['cal-jumbo', 'cal-mini', 'cal-micro'], [80, 151, 295].map((x) => calibreDuNombre(x, CAL)));

/* ── ② LES FOURCHETTES ───────────────────────────────────────────────── */
const FIXE: PrestationBrute = { id: 'f', name: 'KLOKLO', priceXof: 12000 };
const VAR: PrestationBrute = { id: 'v', name: 'GBATA', priceXof: 80000, priceToXof: 120000, priceMode: 'variable' };
const LONG: PrestationBrute = { id: 'l', name: 'FINFIN Profond', priceXof: 80000, prixParLongueur: { court: 80000, 'mi-long': 90000, long: 120000 } };
const MICRO: PrestationBrute = { id: 'm', name: 'VEKPE Micro', priceXof: 0, tarifLockParLongueur: { court: 1400, 'mi-long': 1500, long: 1600 }, bandIds: ['cal-micro'] };
const JUMBO: PrestationBrute = { id: 'j', name: 'VEKPE Jumbo', priceXof: 0, tarifLockParLongueur: { court: 1100, 'mi-long': 1300, long: 1500 }, prixParLongueur: { court: 80000, 'mi-long': 100000, long: 120000 }, bandIds: ['cal-jumbo'] };
const DEVIS: PrestationBrute = { id: 'd', name: 'Sur mesure', priceXof: 0, priceMode: 'devis' };
const base = { calibres: CAL };
dit('un prix fixe', { min: 12000, max: 12000 }, fourchetteDe(FIXE, { ...base, longueur: '' }));
dit('un prix variable dit sa fourchette', { min: 80000, max: 120000 }, fourchetteDe(VAR, { ...base, longueur: '' }));
dit('par longueur : la longueur dite, sinon du plus bas au plus haut', [{ min: 90000, max: 90000 }, { min: 80000, max: 120000 }],
  [fourchetteDe(LONG, { ...base, longueur: 'mi-long' }), fourchetteDe(LONG, { ...base, longueur: '' })]);
dit('creation Micro, 295 locks courtes : 295 x 1 400', { min: 413000, max: 413000 }, fourchetteDe(MICRO, { ...base, locks: 295, longueur: 'court' }));
dit('creation Micro sans nombre : les bornes du calibre (251 a 350)', { min: 351400, max: 490000 }, fourchetteDe(MICRO, { ...base, longueur: 'court' }));
dit('creation Micro sans nombre ni longueur : la plus large', { min: 351400, max: 560000 }, fourchetteDe(MICRO, { ...base, longueur: '' }));
dit('Jumbo : le plancher de la longueur tient', { min: 80000, max: 88000 }, fourchetteDe(JUMBO, { ...base, longueur: 'court' }));
dit('sur devis : pas de nombre', null, fourchetteDe(DEVIS, { ...base, longueur: '' }));
dit('la somme compte a part ce qui est a chiffrer', { min: 92000, max: 132000, aChiffrer: 1 }, somme([{ min: 12000, max: 12000 }, { min: 80000, max: 120000 }, null]));
dit('une prestation archivee ne se propose pas en ligne', [true, false], [proposableEnLigne(FIXE), proposableEnLigne({ ...FIXE, archived: true })]);

/* ── ③ LE DEVIS ESTIMÉ NÉ D'UNE CONSULTATION ──────────────────────────── */
const c: OnlineConsultation = {
  id: 'cg-1', createdAt: '2026-11-13T10:00:00Z', parcours: 'sos', client: { name: 'Awa', phone: '+229 01 97 12 34 56', city: '', currency: 'XOF' },
  answers: {}, paidXof: 0, status: 'nouvelle', modalite: 'auto',
  estimation: {
    lignes: [
      { serviceId: 'a', nom: 'FINFIN Profond', min: 90000, max: 90000, retenue: true },
      { serviceId: 'b', nom: 'GBIGBI', min: 15000, max: 15000, retenue: false },
      { serviceId: 'c', nom: 'Sur mesure', min: null, max: null, retenue: true },
    ],
    aConfirmer: [{ serviceId: 'z', nom: 'ALALA', pourquoi: 'x' }], min: 90000, max: 90000, aChiffrer: 1,
  },
};
dit('le brouillon reprend les lignes retenues, au bas de la fourchette', [['FINFIN Profond', 90000, false], ['Sur mesure', 0, true]],
  lignesDuDevisEstime(c).map((l) => [l.label, l.unitXof, l.aChiffrer]));
dit('sans ligne retenue, il reprend toutes les proposees', 3, lignesDuDevisEstime({ ...c, estimation: { ...c.estimation!, lignes: c.estimation!.lignes.map((l) => ({ ...l, retenue: false })) } }).length);
dit('la cliente se retrouve par ses huit derniers chiffres', 'cl-1', clienteDeLaConsultation(c, [{ id: 'cl-0', phone: '0000' }, { id: 'cl-1', phone: '97123456' }])?.id);
dit('sinon par sa fiche prospect', 'prospect-cg-1', clienteDeLaConsultation(c, [{ id: 'prospect-cg-1' }])?.id);
dit('le mot parle a la cliente, la fourchette et ce qui reste a voir', true, /Votre estimation/.test(motDuDevisEstime(c, (x) => `${x} F`)) && /ALALA/.test(motDuDevisEstime(c, (x) => `${x} F`)));

/* ── ④ LES BRANCHEMENTS ──────────────────────────────────────────────── */
const lf = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const ilot = lf('src/apps/revelateur/ilots/Consultation.tsx');
dit('l ilot est monte, la page existe, l accueil y mene', [true, true, true], [
  /consultation: \(\) => import\('\.\/ilots\/Consultation'\)/.test(lf('src/apps/revelateur/monte.tsx')),
  /chemin: '\/consultation\/',[\s\S]{0,600}ilot: 'consultation'/.test(lf('src/apps/revelateur/contenu.ts')),
  /\{ texte: 'Ma consultation gratuite', vers: '\/consultation\/' \}/.test(lf('src/apps/revelateur/contenu.ts')),
]);
dit('le generateur sait la page sans script', true, /if \(nom === 'consultation'\)/.test(lf('scripts/genere-revelateur.mjs')));
dit('l ilot depose par push-notify (tunnel-submit), jamais en base directe', [true, false],
  [/functions\.invoke\('push-notify'[\s\S]{0,120}mode: 'tunnel-submit'/.test(ilot), /from\('consultations_queue'\)\.(insert|upsert)/.test(ilot)]);
dit('l ilot n importe ni magasin ni synchronisation', false, /from '\.\.\/\.\.\/\.\.\/shared\/(besoins|sync|store|pricing|catalog)'/.test(ilot));
dit('l ilot ne parle jamais de points ni de palier a la cliente', false, /'[^']*\b(points|palier)\b[^']*'/.test(ilot.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => /<|\{`|'.*'/.test(l) && !/import|manques\.|startsWith|includes\(/.test(l)).join('\n')));
const sql = lf('supabase/migrations/0208_la_consultation_ouverte.sql');
dit('0208 : mnd_besoins lisible par le site, ecrit par la direction seule (creer, modifier, retirer)', [true, 3, false],
  [/'mnd_besoins'\n  \]\)\);/.test(sql), (sql.match(/as restrictive for (insert|update|delete)/g) ?? []).length, /as restrictive for (all|select)/.test(sql)]);
dit('0208 recopie la liste blanche de 0127 entiere', true,
  ['mnd_settings', 'mnd_brand', 'mnd_offers', 'mnd_cercle_tiers', 'mnd_points_rate', 'mnd_crown_styles', 'mnd_couronne_compose', 'mnd_vitrine_config', 'mnd_model_bands', 'mnd_model_band_sets', 'mnd_cercle_seuil', 'mnd_horaires_exceptions', 'mnd_avis_google', 'mnd_site_publie', 'mnd_cercle_actif', 'mnd_foyer_actif'].every((k) => sql.includes(`'${k}'`)));
dit('la file A est au Trone, et le devis estime s ouvre depuis elle', [true, true], [
  /<ConsultationsGratuites \/>/.test(lf('src/apps/trone/routes/clients/Consultations.tsx')),
  /params\.get\('consultation'\)[\s\S]{0,1200}status:[^,\n]*'estimé'/.test(lf('src/apps/trone/routes/vente/Factures.tsx')),
]);
dit('l ecran des besoins et la fiche technique se ferment a qui n est pas de la direction', [true, true], [
  /<fieldset disabled=\{!estDirection\}/.test(lf('src/apps/trone/routes/systeme/BesoinsEtRegles.tsx')),
  /<fieldset disabled=\{!estDirection\}/.test(lf('src/apps/trone/routes/vente/FicheTechnique.tsx')),
]);

console.log(`\n${n} verifications.`);
if (process.exitCode) console.log('ECHEC : la consultation ouverte ne tient pas ses promesses.');
else console.log('TOUT VA BIEN : la consultation ouverte tient ses promesses.');
