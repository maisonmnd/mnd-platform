/* SES RITUELS, ÉPROUVÉS — `node scripts/verifie-ses-rituels.mjs` (et `--prouve`).

   2 novembre 2026, P. A. : sa routine alterne un lavage et, tous les deux
   mois, le rituel complet dont le soin (AQUA LOCKS RITUAL™) est fermé à la
   vente. Ma Couronne ne lui montrait que le lavage. Le cas est rejoué ici,
   avec ses dates et ses gestes, et sans son nom. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sesRituelsPasses, estUneVenuePassee, longueurDeSaDerniereVenue, RITUELS_PROPOSES, type VenuePourSesRituels } from '../src/shared/ses-rituels-pur';
import { SUCCESSEURS } from '../src/shared/bascule-de-janvier-pur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const LAVAGE = 'sv-plt-05-ess-c';
const AQUA = 'aqua-locks-ritual';
const DANDAN = 'sv-plt-10-m';
const REPRISE = 'sv-atl-ii-e';
const SUBLIME = 'sv-gbeji-sublimation';
const KOKO = 'sv-koko-ori';
const FINFIN = 'sv-atl-iv-gbp-c';
const OFFERTS = new Set([LAVAGE, DANDAN, REPRISE, SUBLIME, KOKO, FINFIN]);
const proposable = (id: string) => OFFERTS.has(id);
const successeur = (id: string) => (id === AQUA ? DANDAN : undefined);
const estCreation = (id: string) => id === KOKO;

const pa = 'pa';
const rdv = (date: string, status: string, serviceIds: string[], clientId = pa): VenuePourSesRituels => ({ clientId, date, time: '12:00', status, serviceIds });
const SES_RDV: VenuePourSesRituels[] = [
  rdv('2026-06-27', 'honoré', [KOKO, LAVAGE, REPRISE, FINFIN]),
  rdv('2026-07-25', 'honoré', [LAVAGE]),
  rdv('2026-08-08', 'honoré', [LAVAGE, AQUA, REPRISE, SUBLIME]),
  rdv('2026-08-22', 'honoré', [LAVAGE]),
  rdv('2026-09-11', 'honoré', [LAVAGE]),
  rdv('2026-10-10', 'confirmé', [LAVAGE, AQUA, REPRISE, SUBLIME]),
  rdv('2026-11-03', 'confirmé', [LAVAGE]),
  rdv('2026-10-20', 'honoré', [FINFIN], 'une-autre'),
];
const AUJOURDHUI = '2026-11-02';
const siens = (o: Partial<Parameters<typeof sesRituelsPasses>[0]> = {}) =>
  sesRituelsPasses({ rdvs: SES_RDV, clientId: pa, aujourdhui: AUJOURDHUI, proposable, successeur, estCreation, ...o });

/* ── LE CAS DE P. A. ── */
const r = siens();
dit('son rituel complet du 10 octobre 2026 vient en premier, le soin lu sous son successeur',
  { ids: [LAVAGE, DANDAN, REPRISE, SUBLIME], date: '2026-10-10' }, r[0]);
dit('... puis son lavage, du 11 septembre 2026', { ids: [LAVAGE], date: '2026-09-11' }, r[1]);
dit('deux rituels différents, pas trois lavages, et pas la première couronne', 2, r.length);
dit('le RDV de demain, pas encore venu, ne compte pas', false, r.some((x) => x.date === '2026-11-03'));
dit('les RDV d une autre cliente ne comptent pas', false, r.some((x) => x.ids.length === 1 && x.ids[0] === FINFIN));

/* ── LES RÈGLES, UNE À UNE ── */
dit('un confirmé passé compte comme venue', true, estUneVenuePassee({ date: '2026-10-10', status: 'confirmé' }, AUJOURDHUI));
dit('un confirmé du jour même ne compte pas encore', false, estUneVenuePassee({ date: AUJOURDHUI, status: 'confirmé' }, AUJOURDHUI));
dit('un annulé passé ne compte pas', false, estUneVenuePassee({ date: '2026-10-01', status: 'annulé' }, AUJOURDHUI));
dit('un « en attente » passé ne compte pas', false, estUneVenuePassee({ date: '2026-10-01', status: 'en attente' }, AUJOURDHUI));
dit('un honoré compte toujours', true, estUneVenuePassee({ date: '2026-10-01', status: 'honoré' }, AUJOURDHUI));

dit('sans successeur nommé, le rituel au soin fermé ne se propose pas (aucun geste retiré en silence)',
  [{ ids: [LAVAGE], date: '2026-09-11' }], siens({ successeur: () => undefined }));
dit('un successeur lui-même fermé ne sauve rien', [LAVAGE], siens({ successeur: () => 'sv-ferme' })[0].ids);
dit('trois au plus', RITUELS_PROPOSES, sesRituelsPasses({
  rdvs: [rdv('2026-10-01', 'honoré', [LAVAGE]), rdv('2026-10-02', 'honoré', [REPRISE]), rdv('2026-10-03', 'honoré', [SUBLIME]), rdv('2026-10-04', 'honoré', [FINFIN])],
  clientId: pa, aujourdhui: AUJOURDHUI, proposable,
}).length);
dit('le plus récent d abord', ['2026-10-04', '2026-10-03', '2026-10-02'], sesRituelsPasses({
  rdvs: [rdv('2026-10-02', 'honoré', [REPRISE]), rdv('2026-10-04', 'honoré', [FINFIN]), rdv('2026-10-03', 'honoré', [SUBLIME])],
  clientId: pa, aujourdhui: AUJOURDHUI, proposable,
}).map((x) => x.date));
dit('les mêmes gestes dans un autre ordre ne font qu un rituel', 1, sesRituelsPasses({
  rdvs: [rdv('2026-10-02', 'honoré', [REPRISE, LAVAGE]), rdv('2026-10-04', 'honoré', [LAVAGE, REPRISE])],
  clientId: pa, aujourdhui: AUJOURDHUI, proposable,
}).length);
dit('une venue sans geste ne compte pas', [], sesRituelsPasses({ rdvs: [rdv('2026-10-02', 'honoré', [])], clientId: pa, aujourdhui: AUJOURDHUI, proposable }));

/* ── SA LONGUEUR, QUAND SA FICHE SE TAIT ── */
const AVEC_LONGUEUR = [
  { ...rdv('2026-09-11', 'honoré', [LAVAGE]), longueur: 'mi-long' as const },
  { ...rdv('2026-08-22', 'honoré', [LAVAGE]), longueur: 'court' as const },
  { ...rdv('2026-10-10', 'confirmé', [LAVAGE, AQUA]), longueur: 'mi-long' as const },
  { ...rdv('2026-11-03', 'confirmé', [LAVAGE]) },
  { ...rdv('2026-11-20', 'confirmé', [LAVAGE]), longueur: 'long' as const },
  { ...rdv('2026-10-25', 'annulé', [LAVAGE]), longueur: 'long' as const },
  { ...rdv('2026-10-30', 'honoré', [LAVAGE], 'une-autre'), longueur: 'long' as const },
];
dit('la longueur de sa dernière venue (le 10 octobre 2026, mi-long)', 'mi-long', longueurDeSaDerniereVenue(AVEC_LONGUEUR, pa, AUJOURDHUI));
dit('... jamais celle d un RDV à venir, ni d un annulé, ni d une autre cliente', 'court',
  longueurDeSaDerniereVenue(AVEC_LONGUEUR.filter((a) => a.date !== '2026-09-11' && a.date !== '2026-10-10'), pa, AUJOURDHUI));
dit('aucune venue avec longueur : rien, le prix du catalogue', undefined, longueurDeSaDerniereVenue([rdv('2026-09-11', 'honoré', [LAVAGE])], pa, AUJOURDHUI));

/* ── LE SUCCESSEUR CHOISI PAR YÉMAN (2 novembre 2026) ── */
dit('AQUA LOCKS RITUAL™ se lit sous DÀNDÀN™ · L hydratation aux sept huiles', DANDAN, SUCCESSEURS[AQUA]);
dit('... et le successeur de janvier reste', 'sv-atl-iii-cou-c', SUCCESSEURS['sv-atl-iii-cou-l']);

/* ── MA COURONNE LIT CETTE RÈGLE ── */
const sansCommentaires = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const booking = sansCommentaires(readFileSync(process.env.SES_RITUELS_BOOKING ?? path.join(process.cwd(), 'src/apps/couronne/Booking.tsx'), 'utf8'));
dit('Ma Couronne appelle sesRituelsPasses avec les successeurs de la Maison', true,
  booking.includes('sesRituelsPasses({') && booking.includes('successeur: (id) => SUCCESSEURS[id]'));
dit('... et montre chacun de ses rituels, pas seulement le dernier', true,
  booking.includes("sesRituels.map((r, i) => laFormule(r.ids, i === 0 ? t('Comme la dernière fois') : t('Comme le {date}'"));
dit('... et ne relit plus la dernière venue parmi les seuls honorés', false,
  /a\.status === 'honoré' && a\.serviceIds\.length > 0\)\s*\.sort/.test(booking));
dit('Ma Couronne tarife avec la longueur de sa dernière venue quand la fiche n en porte pas', true,
  booking.includes('longueurDeSaDerniereVenue(appts, cible.id, todayIso())') && booking.includes('pricingOf(cibleTarifee ?? undefined, bands, sets, tousCats)'));
const en = readFileSync(path.join(process.cwd(), 'src/apps/couronne/i18n/en-rdv.ts'), 'utf8');
dit('« Comme le {date} » a son anglais', true, en.includes("'Comme le {date}':"));

if (ko) { console.log(`\n${ko} ECHEC(S).`); process.exit(1); }
console.log('\nTout est juste.');
