/* UNE SEULE RÉSERVATION EN LIGNE À LA FOIS, ÉPROUVÉE — `node scripts/verifie-une-place-en-ligne.mjs`.

   24 octobre 2026 : deux têtes de 500 locks posées le même samedi à 14 h,
   l'une au Trône (maître « Team »), l'autre depuis Ma Couronne (sans maître).
   Ma Couronne ne comptait que les rituels de SON maître et pas les fauteuils.
   Au sélecteur, Yéman : en ligne (Ma Couronne, le site, WhatsApp), un rituel
   ne chevauche jamais un rituel déjà inscrit ; le Trône garde la main.
   La règle (agenda-pur `PLACES_EN_LIGNE`), ses trois portes, l'écriture de
   Ma Couronne, la base (migration 0140) et les copies des fonctions Edge.
   Sortie ASCII : la console de Windows. */
import { creneauxLibres, PLACES_EN_LIGNE } from '../src/shared/agenda-pur';
import { issueDeLaPlace, verdictDeLEcriture } from '../src/apps/couronne/reservation-pure';
import { readFileSync } from 'node:fs';

let ko = 0;
let n = 0;
const ascii = (v: unknown): string =>
  (JSON.stringify(v) ?? 'undefined').replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : ` -> ${ascii(obtenu)}`}`);
  if (!ok) console.log(`       attendu ${ascii(attendu)}`);
};
const lis = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const sansCommentaires = (f: string) => lis(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s+/g, ' ');

/* ── Le cas du samedi ─────────────────────────────────────────────────── */
const OUVERT = { closed: false, openMin: 9 * 60, closeMin: 19 * 60 };
const SAMEDI = [{ maitre: 'Team', debutMin: 14 * 60, dureeMin: 195 }];
dit('la regle : une place en ligne', 1, PLACES_EN_LIGNE);
dit('AVANT : sans plafond, une reservation sans maitre trouvait 14 h libre (le defaut du samedi)', true,
  creneauxLibres({ opening: OUVERT, durationMin: 195, occupes: SAMEDI, master: '' }).includes('14:00'));
const apres = creneauxLibres({ opening: OUVERT, durationMin: 195, occupes: SAMEDI, master: '', capSimultane: PLACES_EN_LIGNE });
dit('APRES : 14 h n est plus proposee, ni 11 h, 12 h, 13 h (elles deborderaient sur 14 h)', [false, false, false, false],
  ['11:00', '12:00', '13:00', '14:00'].map((h) => apres.includes(h)));
dit('... 9 h et 10 h restent (fini avant 14 h) ; apres 17 h 15 la journee ne laisse plus 3 h 15', ['09:00', '10:00'], apres);
dit('... quel que soit le maitre demande (Team, Expert, aucun)', [false, false, false],
  ['Team', 'Expert', ''].map((m) => creneauxLibres({ opening: OUVERT, durationMin: 60, occupes: SAMEDI, master: m, capSimultane: PLACES_EN_LIGNE }).includes('15:00')));

/* ── Les trois portes en ligne ────────────────────────────────────────── */
dit('Ma Couronne : ses heures libres comptent tous les rituels', true,
  sansCommentaires('src/apps/couronne/lib.ts').includes('capSimultane: PLACES_EN_LIGNE,'));
dit('le site : les heures qu il propose aussi', true,
  sansCommentaires('src/apps/revelateur/agenda.ts').includes('capSimultane: PLACES_EN_LIGNE,'));
dit('le juge du serveur (site, WhatsApp) : une place, pas les fauteuils', true,
  sansCommentaires('src/shared/place-du-serveur.ts').includes('sieges: PLACES_EN_LIGNE,'));

/* ── L'écriture de Ma Couronne ────────────────────────────────────────── */
dit('la place relue : libre ecrit, prise revient aux heures, murs inconnus n ecrivent rien',
  ['ecrire', 'prise', 'inconnue'], [
    issueDeLaPlace({ mursConnus: true, seancesToujoursLibres: true, acompteVerifie: false }),
    issueDeLaPlace({ mursConnus: true, seancesToujoursLibres: false, acompteVerifie: false }),
    issueDeLaPlace({ mursConnus: false, seancesToujoursLibres: false, acompteVerifie: false })]);
dit('... acompte deja encaisse : prise, la Maison rappelle ; murs inconnus, on ecrit (on ne perd pas qui a paye)',
  ['prise-acompte-recu', 'ecrire'], [
    issueDeLaPlace({ mursConnus: true, seancesToujoursLibres: false, acompteVerifie: true }),
    issueDeLaPlace({ mursConnus: false, seancesToujoursLibres: false, acompteVerifie: true })]);
dit('la reponse de la base : rien, posee ; creneau_pris, prise ; autre chose, echec', ['posee', 'prise', 'echec'],
  [verdictDeLEcriture(null), verdictDeLEcriture('creneau_pris'), verdictDeLEcriture('Failed to fetch')]);
const booking = sansCommentaires('src/apps/couronne/Booking.tsx');
dit('les murs se relisent toujours, acompte ou non', [true, false],
  [booking.includes("const mursFrais = await relisLesMurs(sb ? () => sb.rpc('creneaux_occupes', {"), booking.includes('peutNaitreConfirme ?')]);
dit('le rendez-vous s ecrit en base et attend sa reponse AVANT le telephone', true,
  /await sb\.from\('appointments'\)\.insert\(poses\.map[\s\S]*?appointmentsStore\.set\(\(prev\) => \[\.\.\.prev, \.\.\.poses\]\)/.test(booking));
dit('une place prise a la base ne laisse rien sur le telephone', true,
  booking.includes("if (verdict === 'prise') { if (online?.confirmed) acompteSansPlace(); else laPlacePrise(); return; }"));
dit('la duree de SA tete se fige sur le rendez-vous (calibre compris)', true, booking.includes('dureeMin: totalDuration,'));

/* ── La base : migration 0140 ─────────────────────────────────────────── */
const m140 = lis('supabase/migrations/0140_une_place_en_ligne_a_la_fois.sql');
const fonction = (sql: string, nom: string) => {
  const i = sql.indexOf(`create or replace function public.${nom}(`);
  return i < 0 ? '' : sql.slice(i, sql.indexOf('end $$;', i) + 7);
};
dit('pose_si_libre (site, WhatsApp) : une place', true, fonction(m140, 'pose_si_libre').includes('  sieges := 1;'));
const BLOC_FAUTEUILS = /  select case when btrim\(coalesce\(b\.data->>'seats'[\s\S]*?sieges := coalesce\(sieges, 0\);\n/;
dit('... le reste du verrou est celui de 0125, mot pour mot', true,
  fonction(lis('supabase/migrations/0125_la_maison_repond_sur_whatsapp.sql'), 'pose_si_libre').replace(BLOC_FAUTEUILS, '')
  === fonction(m140, 'pose_si_libre').replace(/  -- UNE SEULE RÉSERVATION EN LIGNE[\s\S]*?  sieges := 1;\n/, ''));
const garde = fonction(m140, 'une_place_en_ligne').replace(/\s+/g, ' ');
dit('le garde laisse la main au personnel et au serveur', true, garde.includes('if auth.uid() is null or public.is_staff() then return new; end if;'));
dit('... ignore un rituel annule, et une ecriture qui ne change ni jour ni heure', [true, true],
  [garde.includes("if coalesce(new.data->>'status', '') = 'annulé' or debut is null"), garde.includes("and coalesce(old.data->>'status', '') <> 'annulé' then return new;")]);
dit('... sous le verrou de pose_si_libre, contre tout rituel non annule sauf lui-meme', [true, true, true], [
  garde.includes("perform pg_advisory_xact_lock(hashtext('pose'), hashtext(branche || ':' || jour));"),
  garde.includes('where a.id <> new.id'),
  garde.includes('debut < public.minutes_de_l_heure(a.data->>\'time\') + public.duree_du_rdv(a.data) and debut + duree > public.minutes_de_l_heure(a.data->>\'time\')')]);
dit('... refuse par creneau_pris, a la creation comme au deplacement', [true, true],
  [garde.includes("raise exception 'creneau_pris'"), /before insert or update on public\.appointments\s+for each row execute function public\.une_place_en_ligne\(\);/.test(m140)]);

/* ── Les copies des fonctions Edge ───────────────────────────────────── */
for (const f of ['supabase/functions/demande-submit/index.ts', 'supabase/functions/whatsapp-automate/index.ts']) {
  const s = lis(f);
  dit(`${f.split('/')[2]} : la regle, le juge a une place, la version du 24 octobre`, [true, true, true],
    [s.includes('export const PLACES_EN_LIGNE = 1;'), s.includes('sieges: PLACES_EN_LIGNE,'), s.includes("const VERSION = '2026-10-24-")]);
}

console.log(`\n${n - ko}/${n} epreuves : une seule reservation en ligne a la fois.`);
if (ko) console.log(`${ko} ECHEC(S).`);
