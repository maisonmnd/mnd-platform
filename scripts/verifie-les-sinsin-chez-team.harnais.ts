/* LES SÍNSIN CHEZ TEAM, ÉPROUVÉS — `node scripts/verifie-les-sinsin-chez-team.mjs`.

   24 octobre 2026 : « La couronne doit toujours proposer un seul maître Team
   pour les SÍNSIN. L'expert n'est proposé que pour les autres services »
   (Yéman) ; au sélecteur : PARTOUT, et les autres prestations gardent Team et
   Expert. La même conversation : « la date d'aujourd'hui doit être proposée
   quand on ouvre Quand ? » et « au Trône on peut réserver cette heure et
   overwrite l'horaire ». La règle (agenda-pur), ses quatre portes, le
   « + RDV » du Trône et les copies des fonctions Edge.
   Sortie ASCII : la console de Windows. */
import { estUnSinsin, maitresPermis, MAITRE_DES_SINSIN } from '../src/shared/agenda-pur';
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

/* ── La règle ─────────────────────────────────────────────────────────── */
dit('un SINSIN se reconnait a son nom, accents et majuscules confondus', [true, true, true, false, false], [
  estUnSinsin('SÍNSIN™ Signature · La Reprise Longue Durée'), estUnSinsin('SÍNSIN™ Kids · La Reprise'), estUnSinsin('sinsin essentiel'),
  estUnSinsin('GBÈJÍ™ Fidélité · Reprise & Shampoing Signature'), estUnSinsin(undefined)]);
dit('le maitre des SINSIN', 'Team', MAITRE_DES_SINSIN);
dit('un SINSIN dans la venue : Team seul, meme avec d autres gestes', ['Team'],
  maitresPermis(['KLOKLO™ Essentiel', 'SÍNSIN™ Signature · La Reprise Longue Durée', 'Sublimation'], ['Team', 'Expert']));
dit('sans SINSIN : Team et Expert, comme avant', ['Team', 'Expert'], maitresPermis(['YÈKPÈ™ Lumière'], ['Team', 'Expert']));
dit('une branche sans Team garde ses maitres (rien ne s invente)', ['Expert'], maitresPermis(['SÍNSIN™ Kids'], ['Expert']));

/* ── Les quatre portes ────────────────────────────────────────────────── */
dit('le juge du serveur (site, WhatsApp) : SINSIN chez Team seul', true,
  sansCommentaires('src/shared/place-du-serveur.ts').includes('if (serviceIds.some((id) => estUnSinsin(agenda.services.find((s) => s.id === id)?.name))) return [MAITRE_DES_SINSIN];'));
dit('le site : ses heures se cherchent chez Team pour un SINSIN', true,
  sansCommentaires('src/apps/revelateur/agenda.ts').includes('const maitres = sinsin ? [MAITRE_DES_SINSIN]'));
const booking = sansCommentaires('src/apps/couronne/Booking.tsx');
dit('Ma Couronne : la reservation ecrit Team pour un SINSIN, sans note « maitres multiples »', [true, true], [
  booking.includes("const master = avecUnSinsin ? MAITRE_DES_SINSIN : (selected[0]?.master ?? '');"),
  booking.includes('const masterVaries = !avecUnSinsin &&')]);
dit('Ma Couronne : la seance incluse et le forfait aussi', [true, true], [
  sansCommentaires('src/apps/couronne/ReserverIncluse.tsx').includes('const maitre = service && estUnSinsin(service.name) ? MAITRE_DES_SINSIN'),
  sansCommentaires('src/apps/couronne/Cycle.tsx').includes('const master = estUnSinsin(forfait.name) || seances.some((sc) => sc.noms.some(estUnSinsin)) ? MAITRE_DES_SINSIN')]);

/* ── Le « + RDV » du Trône ───────────────────────────────────────────── */
const rdv = sansCommentaires('src/apps/trone/routes/clients/_shared.tsx');
dit('a la creation, un SINSIN pose Team ; Au fauteuil ne propose que les maitres permis', [true, true, true], [
  rdv.includes('if (!appt && avecUnSinsin && branch.masters.includes(MAITRE_DES_SINSIN) && master !== MAITRE_DES_SINSIN) setMaster(MAITRE_DES_SINSIN);'),
  rdv.includes('const maitresOfferts = maitresPermis(chosen.map((sv) => sv.name), branch.masters);'),
  rdv.includes('{maitresDuSelect.map((m) => ( <option key={m} value={m}>{m}</option> ))}')]);
dit('son maitre habituel ne revient que s il peut recevoir ce rituel', [true, false], [
  rdv.includes('if (maitreHabituel) setMaster(maitreHabituel);'),
  rdv.includes('if (habitude.master && branch.masters.includes(habitude.master)) setMaster(habitude.master);')]);
dit('Quand ? montre aujourd hui d abord', true,
  rdv.includes(': semaine.find((j) => j.iso === aujourdhui) ?? semaine.find((j) => j.heures.length > 0);'));
dit('fauteuils pleins : « Poser quand meme » leve le blocage, pour cette heure-la seulement', [true, true, true], [
  rdv.includes('force: forcePlein,'),
  rdv.includes('onClick={() => setForcePlein(true)}'),
  rdv.includes('useEffect(() => { setForcePlein(false); }, [date, time, dureeRetenue]);')]);

/* ── Les copies des fonctions Edge ───────────────────────────────────── */
for (const f of ['supabase/functions/demande-submit/index.ts', 'supabase/functions/whatsapp-automate/index.ts']) {
  const s = lis(f);
  /* La version : celle des SINSIN ou une plus recente (la fonction avance). */
  const version = /const VERSION = '(\d{4}-\d{2}-\d{2}-[a-z])/.exec(s)?.[1] ?? '';
  dit(`${f.split('/')[2]} : la regle des SINSIN, son juge, la version 2026-10-24-b ou plus recente`, [true, true, true], [
    s.includes("export const MAITRE_DES_SINSIN = 'Team';"),
    s.includes('if (serviceIds.some((id) => estUnSinsin(agenda.services.find((s) => s.id === id)?.name))) return [MAITRE_DES_SINSIN];'),
    version >= '2026-10-24-b']);
}

console.log(`\n${n - ko}/${n} epreuves : les SINSIN chez Team, aujourd hui d abord, la main du Trone.`);
if (ko) console.log(`${ko} ECHEC(S).`);
