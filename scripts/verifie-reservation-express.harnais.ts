import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  FORMULES_GARDEES, formulesDesVenues, memesFormules, memoireAEcrire, memoireLue, payloadDeLaReprise,
  prochainesPlaces, repriseDuPayload, reprisesAProposer, VENUES_MIN_FORMULE,
} from '../src/shared/reservation-express';

/* LA RÉSERVATION EN TRENTE SECONDES, ÉPROUVÉE — 29 septembre 2026.

   Maquette « La réservation en 30 secondes », validée par Yéman, avec
   « Tout de suite » pour la confirmation. Ce harnais tient la RÈGLE :

     (1) les formules rapides viennent des venues HONORÉES de six mois, une
         combinaison vue deux fois au moins, sans geste retiré, les plus
         fréquentes d'abord ;
     (2) les prochaines places se lisent dans l'ordre du temps, six au plus ;
     (3) la mémoire du téléphone rejette ce qui est abîmé et ne garde JAMAIS
         le maître ni le code ;
     (4) la reprise J-3 ne vise que les reprises posées d'office, confirmées,
         sans réponse ; les deux rives (rappels-j1, webhook) portent le même
         juge et la même forme de bouton : on fait tourner LA COPIE ;
     (5) le site pose la place confirmée et envoie LA confirmation sous
         l'identifiant du balayage (jamais deux messages) ;
     (6) la cliente ne choisit ni ne lit le maître : ni au site, ni dans le
         tunnel de Ma Couronne. */

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko += 1;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};
const lis = (f: string) => readFileSync(f, 'utf8');

/* ── (1) Les formules ── */
const vivants = new Set(['lav', 'rac', 'soin', 'coif', 'mort-bientot']);
const auj = '2026-09-29';
const v = (date: string, ids: string[], status = 'honoré') => ({ date, status, serviceIds: ids });
const venues = [
  v('2026-09-20', ['lav', 'rac', 'soin']),
  v('2026-09-10', ['rac', 'lav', 'soin']),          // meme venue, autre ordre
  v('2026-08-01', ['soin', 'rac', 'lav']),
  v('2026-09-01', ['rac']),
  v('2026-07-01', ['rac']),
  v('2026-09-05', ['coif']),                         // une seule fois : un cas
  v('2026-09-06', ['lav', 'rac', 'soin'], 'confirmé'), // pas honoree
  v('2026-09-07', ['lav', 'rac', 'soin'], 'annulé'),
  v('2026-01-01', ['coif']),                         // hors des six mois
  v('2026-09-08', ['lav', 'retire']),
  v('2026-09-09', ['lav', 'retire']),                // geste retire : la formule tombe
  v('2026-10-02', ['coif']),                         // futur
];
const f = formulesDesVenues(venues, vivants, auj);
dit('les formules : la plus frequente d abord, rangee comme la venue la plus recente', [
  { serviceIds: ['lav', 'rac', 'soin'], venues: 3 },
  { serviceIds: ['rac'], venues: 2 },
], f);
dit('... une venue unique n est pas une formule', VENUES_MIN_FORMULE, 2);
dit('... hors des six mois, rien', [], formulesDesVenues([v('2026-03-01', ['rac']), v('2026-03-02', ['rac'])], vivants, auj));
dit('... six au plus', FORMULES_GARDEES, formulesDesVenues(
  Array.from({ length: 9 }, (_, i) => [v('2026-09-01', [`s${i}`]), v('2026-09-02', [`s${i}`])]).flat(),
  new Set(Array.from({ length: 9 }, (_, i) => `s${i}`)), auj).length);
dit('... la meme liste ne se reecrit pas, une autre si', [true, false],
  [memesFormules(f, formulesDesVenues(venues, vivants, auj)), memesFormules(f, f.slice(1))]);

/* ── (2) Les prochaines places ── */
const jours = [
  { iso: '2026-10-02', heures: [{ heure: '14:00', maitre: 'A' }, { heure: '09:00', maitre: 'B' }] },
  { iso: '2026-09-30', heures: [{ heure: '16:00', maitre: 'A' }] },
  { iso: '2026-10-01', heures: [{ heure: '10:00', maitre: 'A' }, { heure: '11:00', maitre: 'A' }, { heure: '12:00', maitre: 'A' }, { heure: '13:00', maitre: 'A' }] },
];
dit('les places : deux par jour d abord (matin, apres-midi), dans l ordre du temps', [
  '2026-09-30 16:00', '2026-10-01 10:00', '2026-10-01 13:00', '2026-10-02 09:00', '2026-10-02 14:00',
], prochainesPlaces(jours, 5).map((p) => `${p.iso} ${p.place.heure}`));
dit('... puis on complete dans l ordre quand les jours manquent, six au plus', [
  '2026-09-30 16:00', '2026-10-01 10:00', '2026-10-01 11:00', '2026-10-01 13:00', '2026-10-02 09:00', '2026-10-02 14:00',
], prochainesPlaces(jours, 6).map((p) => `${p.iso} ${p.place.heure}`));
dit('... un seul jour ouvert : ses six premieres heures', ['10:00', '11:00', '12:00', '13:00'],
  prochainesPlaces([jours[2]], 6).map((p) => p.place.heure));
dit('... aucune place, aucune pastille', [], prochainesPlaces([], 6));

/* ── (3) La memoire du telephone ── */
const bonne = { prenom: 'Awa', numero: '01 97 00 00 00', serviceIds: ['lav', 'rac'], calibreId: 'inconnu', besoin: 'entretien' };
dit('la memoire se relit telle qu ecrite', bonne, memoireLue(memoireAEcrire(bonne)));
dit('... abimee, elle est rejetee entiere', [null, null, null, null],
  [memoireLue('{pas du json'), memoireLue(JSON.stringify({ ...bonne, numero: '123' })), memoireLue(JSON.stringify({ ...bonne, serviceIds: [] })), memoireLue(null)]);
const ecrite = JSON.parse(memoireAEcrire({ ...bonne, master: 'Befoune', code: 'AWA-K7P' } as never));
dit('... elle ne garde jamais le maitre ni le code', [false, false], ['master' in ecrite, 'code' in ecrite]);

/* ── (4) La reprise J-3 ── */
const r = (o: Record<string, unknown>) => ({ id: 'r', date: '2026-10-02', status: 'confirmé', clientId: 'c', repriseDe: 'a0', ...o });
const cas = [
  r({ id: 'ok' }),
  r({ id: 'pas-reprise', repriseDe: undefined }),
  r({ id: 'en-attente', status: 'en attente' }),
  r({ id: 'sans-fiche', clientId: '' }),
  r({ id: 'deja-confirmee', confirmeeParLaClienteLe: '2026-09-29' }),
  r({ id: 'autre-moment', autreMomentDemandeLe: '2026-09-29' }),
  r({ id: 'autre-jour', date: '2026-10-03' }),
];
dit('la reprise J-3 : seulement posee d office, confirmee, rattachee, sans reponse', ['ok'],
  reprisesAProposer(cas as never[], '2026-10-02').map((a: { id: string }) => a.id));
dit('le bouton porte le rendez-vous, et se relit', [{ geste: 'OK', apptId: 'ap-1' }, { geste: 'AUTRE', apptId: 'ap-2' }, null],
  [repriseDuPayload(payloadDeLaReprise('OK', 'ap-1')), repriseDuPayload(payloadDeLaReprise('AUTRE', 'ap-2')), repriseDuPayload('RECU:ap-1')]);

/* La COPIE de rappels-j1 tourne, sur les memes cas. */
const rappels = lis('supabase/functions/rappels-j1/index.ts');
const debut = rappels.indexOf('const reprisesAProposer = ');
const fin = rappels.indexOf(';', rappels.indexOf('!a.autreMomentDemandeLe', debut)) + 1;
dit('rappels-j1 porte sa copie du juge', true, debut > 0 && fin > debut);
const { transform } = await import(pathToFileURL(path.join(process.cwd(), 'node_modules/esbuild/lib/main.js')).href) as typeof import('esbuild');
const { code: js } = await transform(`type Reprise = any;\n${rappels.slice(debut, fin)}\nexport { reprisesAProposer };`, { loader: 'ts', format: 'esm' });
const banc = mkdtempSync(path.join(os.tmpdir(), 'reservation-express-'));
let copie: { reprisesAProposer: (a: readonly unknown[], j: string) => { id: string }[] };
try {
  writeFileSync(path.join(banc, 'copie.mjs'), js);
  copie = await import(pathToFileURL(path.join(banc, 'copie.mjs')).href);
} finally {
  rmSync(banc, { recursive: true, force: true });
}
for (const jour of ['2026-10-02', '2026-10-03', '2026-10-04']) {
  dit(`... la copie juge comme le depot (${jour})`,
    reprisesAProposer(cas as never[], jour).map((a: { id: string }) => a.id),
    copie.reprisesAProposer(cas, jour).map((a) => a.id));
}
dit('rappels-j1 : trois jours, les deux boutons dans l ordre, et rien sans modele', [true, true, true, true], [
  rappels.includes('const JOURS_AVANT_LA_REPRISE = 3;'),
  rappels.includes("index: '0', parameters: [{ type: 'payload', payload: `REPRISE_OK:${a.id}` }]"),
  rappels.includes("index: '1', parameters: [{ type: 'payload', payload: `REPRISE_AUTRE:${a.id}` }]"),
  rappels.includes("if (!MODELE || !WA_TOKEN || !WA_PHONE_ID) return { reprises: 'sans-modele' };"),
]);
dit('... elle passe avant le retour d un soir sans rappel', true,
  rappels.indexOf('await proposeLesReprises(sb, salleOuverte, regles)') > 0
  && rappels.indexOf('await proposeLesReprises(sb, salleOuverte, regles)') < rappels.indexOf("JSON.stringify({ jour: demain, rdv: 0, ...reprises })"));

const webhook = lis('supabase/functions/whatsapp-webhook/index.ts');
dit('le webhook lit le meme bouton que le depot', true, webhook.includes(String.raw`.match(/^REPRISE_(OK|AUTRE):(.+)$/)`)
  && lis('src/shared/reservation-express.ts').includes(String.raw`/^REPRISE_(OK|AUTRE):(.+)$/`));
dit('... n ecoute que le numero de la fiche, n annule jamais, eteint la relance', [true, false, true], [
  webhook.includes('!fiche.numeros.includes(e.numero)'),
  /REPRISE_[\s\S]{0,4000}status: 'annulé'/.test(webhook.slice(webhook.indexOf('bis·2 LA REPRISE'), webhook.indexOf('⑤ ter LE FORMULAIRE'))),
  webhook.includes('confirmeeParLaClienteLe: e.quand, relanceFaite: true'),
]);

/* ── (5) Le site pose la place confirmee, une seule confirmation ── */
const submit = lis('supabase/functions/demande-submit/index.ts');
const conf = lis('supabase/functions/confirmation-rdv/index.ts');
dit('le site pose le rendez-vous confirme', [true, false], [
  /status: 'confirmé',\s*source: 'site'/.test(submit), /status: 'en attente',\s*source: 'site'/.test(submit)]);
dit('... et envoie LA confirmation sous l identifiant du balayage', [true, true, true], [
  submit.includes('`conf-${o.apptId}-whatsapp`'),
  conf.includes('id: `conf-${a.id}-${canal}`'),
  submit.includes("Deno.env.get('WA_TEMPLATE_CONF') ?? 'confirmation_rdv'") && conf.includes("Deno.env.get('WA_TEMPLATE_CONF') ?? 'confirmation_rdv'"),
]);
dit('... le balayage ne verrouille que sur un envoi reussi (un echec du site se retente)', true,
  /* Depuis la salle d'attente (2 octobre 2026), deux verdicts se retentent :
     l'échec, et le message périmé par un rendez-vous déplacé pendant l'attente. */
  conf.includes(".filter((r) => !SE_RETENTE.has((r.data as { statut?: string } | null)?.statut ?? ''))")
  && conf.includes("const SE_RETENTE = new Set(['échec', 'périmé']);"));

/* ── (6) Le maitre n est ni choisi ni lu par la cliente ── */
const reserver = lis('src/apps/revelateur/ilots/Reserver.tsx');
const sansCommentaires = reserver.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const usagesDuMaitre = sansCommentaires.match(/maitre/g)?.length ?? 0;
dit('le site : le maitre ne voyage que vers le serveur, jamais a l ecran', [true, false], [
  sansCommentaires.includes('master: heure.maitre'),
  /\{[^}]*\.maitre[^}]*\}\s*<\//.test(sansCommentaires),
]);
dit('... et ne paraît qu une poignee de fois (types et envoi)', true, usagesDuMaitre <= 6);
dit('le site : plus de case a cocher, la phrase la remplace', [false, true],
  [sansCommentaires.includes('type="checkbox"'), reserver.includes('En réservant, vous acceptez que la Maison vous écrive sur WhatsApp')]);
const booking = lis('src/apps/couronne/Booking.tsx');
dit('Ma Couronne : le tunnel n annonce plus de nom', false, booking.includes('` · avec ${master}'));
dit('Ma Couronne : sans acompte, la place est tenue', true, booking.includes("const tenu = !!online?.confirmed || !hasDeposit;")
  && booking.includes("status: tenu ? 'confirmé' : 'en attente',"));
const tabs = lis('src/apps/couronne/Tabs.tsx');
dit('Ma Couronne : « Reserver ce moment » emporte tous les gestes et son heure', [true, true], [
  tabs.includes('serviceIds: predite.template!.serviceIds,'),
  /* Depuis le 7 octobre, avec `express` : la touche réserve vraiment. */
  tabs.includes('...(predite.template!.time ? { time: predite.template!.time, express: true } : {}),'),
]);

console.log(ko === 0 ? '\nTout tient.' : `\n${ko} echec(s).`);
if (ko) process.exit(1);
