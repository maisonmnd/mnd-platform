/* DEUX POSTES SUR LA MÊME FICHE — une séance, lancée par
   `verifie-les-deux-postes.mjs` (20 novembre 2026, « corrige le problème des
   deux postes »).

   La VRAIE synchronisation (`bindCollection`) sur le faux serveur
   (`faux-supabase.ts`). Un AUTRE poste écrit sur la même fiche que ce poste,
   un autre champ ; on regarde ce que portent, à la fin, le serveur et l'écran.
   `ETAPE` :
     - `pur` : la règle (`fusionneLesChamps`) et l'arbitre de la file, sans
       réseau ;
     - `seance` (défaut) :
       A. ce poste porte une copie d'avant (le direct a manqué l'écriture de
          l'autre) et y fait un geste : le serveur garde les champs de l'autre ;
       B. hors ligne, un geste attend ; l'écriture de l'autre arrive en direct :
          les deux restent, sans conflit ;
       C. hors ligne, un geste attend ; l'autre écrit sans que le direct le
          dise ; au retour du réseau, la file se rejoue : les deux restent ;
       D. le MÊME champ des deux côtés : le plus récent gagne ce champ, le
          nôtre est gardé en conflit pour lui seul, et notre autre champ reste.
   Les fiches sont inventées. */
import './faux-stockage';
import { leReseauRevient } from './faux-stockage';
import { faux, ecritAilleurs, heureServeur } from './faux-supabase';
import { createStore } from '../src/shared/store';
import * as synchro from '../src/shared/sync';
import { laPorteARepondu } from '../src/shared/auth';
import { arbitre, champsQuiDifferent, lisLesConflitsNotes, type Entree } from '../src/shared/file-d-attente';
import { fusionneLesChamps } from '../src/shared/fusion-des-champs';

type Fiche = { id: string; branchId: string; nom: string; anniv?: string; accord?: string };
const attend = (ms: number) => new Promise((r) => setTimeout(r, ms));
const dit = (x: unknown) => { console.log(`RESULTAT ${JSON.stringify(x)}`); process.exit(0); };
const canon = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, (x as Record<string, unknown>)[k]])) : x));

if (process.env.ETAPE === 'pur') {
  const base = { id: 'x', nom: 'Shadé', tel: '1' };
  const r = {
    /* Nous : la signature ; eux : le nom. Les deux restent. */
    deuxChamps: fusionneLesChamps(base, { ...base, accord: 'signé' }, { ...base, nom: 'Audrey' }).ligne,
    /* Le même champ, deux valeurs : le nôtre gagne si notre geste est le plus récent… */
    disputeGagnee: fusionneLesChamps(base, { ...base, nom: 'Chadé' }, { ...base, nom: 'Audrey' }),
    /* … le leur sinon, et notre valeur est dite perdue. */
    disputePerdue: fusionneLesChamps(base, { ...base, nom: 'Chadé' }, { ...base, nom: 'Audrey' }, true),
    /* Le même champ, la même valeur : pas une dispute. */
    memeValeur: fusionneLesChamps(base, { ...base, nom: 'Audrey' }, { ...base, nom: 'Audrey' }).disputes,
    /* Un champ que NOUS retirons part ; un champ qu'ILS retirent part aussi. */
    retraits: fusionneLesChamps(base, { id: 'x', nom: 'Shadé' }, { id: 'x', nom: 'Shadé', tel: '1', anniv: 'a' }).ligne,
    retraitsLeur: fusionneLesChamps(base, { ...base, accord: 'signé' }, { id: 'x', nom: 'Shadé' }).ligne,
    /* Sans base, rien ne se fusionne : notre ligne part telle quelle. */
    sansBase: fusionneLesChamps(undefined, { ...base, accord: 'signé' }, { ...base, nom: 'Audrey' }).ligne,
    /* Les champs rangés autrement ne sont pas un changement. */
    ordre: fusionneLesChamps({ a: { x: 1, y: 2 } }, { a: { y: 2, x: 1 } }, { a: { x: 1, y: 2 }, b: 3 }).ligne,
  };
  /* L'ARBITRE DE LA FILE, AVEC LA BASE DU GESTE. */
  const geste = (j: unknown, b: unknown, at: string): Entree => ({ op: 'set', at, j: JSON.stringify(j), b: JSON.stringify(b), connue: true });
  const serveur = [{ ...base, nom: 'Audrey' }];
  const tard = new Map([['x', '2026-11-20T14:20:00.000Z']]);
  const a1 = arbitre(serveur, tard, new Map([['x', geste({ ...base, accord: 'signé' }, base, '2026-11-20T14:19:00.000Z')]]), canon);
  const a2 = arbitre(serveur, tard, new Map([['x', geste({ ...base, nom: 'Chadé', accord: 'signé' }, base, '2026-11-20T14:19:00.000Z')]]), canon);
  /* Une entrée d'avant ce jour, sans base : ligne contre ligne, comme avant. */
  const ancienne: Entree = { op: 'set', at: '2026-11-20T14:19:00.000Z', j: JSON.stringify({ ...base, accord: 'signé' }), connue: true };
  const a3 = arbitre(serveur, tard, new Map([['x', ancienne]]), canon);
  dit({
    ...r,
    arbitreDeuxChamps: { items: a1.items, aPousser: a1.aPousser, conflits: a1.conflits.length, reecrite: a1.reecrites.get('x')?.j ? JSON.parse(a1.reecrites.get('x')!.j!) : null },
    arbitreDispute: { items: a2.items, conflits: a2.conflits.map((c) => champsQuiDifferent({ table: 't', notre: c.notre, leur: c.leur })) },
    arbitreSansBase: { aPousser: a3.aPousser, conflits: a3.conflits.length },
  });
}

laPorteARepondu();
const F = (o: Partial<Fiche> = {}): Fiche => ({ id: 'x', branchId: 'b', nom: 'Shadé', ...o });
/** L'autre poste écrit, et le direct NE le dit PAS (canal tombé, onglet endormi). */
const ecritEnSilence = (t: string, data: Fiche): void => {
  let m = faux.base.get(t);
  if (!m) { m = new Map(); faux.base.set(t, m); }
  m.set(data.id, { id: data.id, branch_id: data.branchId, data, updated_at: heureServeur() });
};
const auServeur = (t: string): Fiche => (faux.base.get(t)!.get('x') as { data: Fiche }).data;
const vue = (f: Fiche | undefined) => (f ? { nom: f.nom, anniv: f.anniv ?? null, accord: f.accord ?? null } : null);
const aLEcran = (s: { get: () => Fiche[] }) => vue(s.get().find((x) => x.id === 'x'));
const conflitsDe = (t: string) => lisLesConflitsNotes().filter((c) => c.table === t)
  .map((c) => champsQuiDifferent({ table: t, notre: c.notre, leur: c.leur }));
const ouvre = async (t: string) => {
  ecritAilleurs(t, 'x', F());
  const s = createStore<Fiche[]>(`mnd_${t}`, []);
  synchro.bindCollection(s, t);
  await attend(600);
  return s;
};
const signe = (s: { set: (f: (p: Fiche[]) => Fiche[]) => void }, o: Partial<Fiche>) =>
  s.set((p) => p.map((x) => (x.id === 'x' ? { ...x, ...o } : x)));

/* A. UNE COPIE D'AVANT : l'autre a corrigé le nom et l'anniversaire, le
   direct ne l'a pas dit ; ce poste fait signer l'autorisation. */
const a = await ouvre('deux_a');
ecritEnSilence('deux_a', F({ nom: 'Audrey', anniv: '1988-02-20' }));
signe(a, { accord: 'signé' });
await attend(1200);
const A = { serveur: vue(auServeur('deux_a')), ecran: aLEcran(a), conflits: conflitsDe('deux_a') };

/* B. HORS LIGNE, UN GESTE ATTEND ; l'écriture de l'autre arrive en direct. */
const b = await ouvre('deux_b');
faux.enLigne = false;
signe(b, { accord: 'signé' });
await attend(500);
ecritAilleurs('deux_b', 'x', F({ nom: 'Audrey', anniv: '1988-02-20' }));
await attend(200);
const Bpendant = aLEcran(b);
faux.enLigne = true;
leReseauRevient();
await attend(1800);
const B = { pendant: Bpendant, serveur: vue(auServeur('deux_b')), ecran: aLEcran(b), conflits: conflitsDe('deux_b') };

/* C. HORS LIGNE, UN GESTE ATTEND ; l'autre écrit et le direct se tait ;
   au retour du réseau, la file se rejoue sur le serveur. */
const c = await ouvre('deux_c');
faux.enLigne = false;
signe(c, { accord: 'signé' });
await attend(500);
ecritEnSilence('deux_c', F({ nom: 'Audrey', anniv: '1988-02-20' }));
faux.enLigne = true;
leReseauRevient();
await attend(1800);
const C = { serveur: vue(auServeur('deux_c')), ecran: aLEcran(c), conflits: conflitsDe('deux_c') };

/* D. LE MÊME CHAMP DES DEUX CÔTÉS : ce poste écrit « Chadé » hors ligne, et
   signe ; l'autre écrit « Audrey » plus tard. */
const d = await ouvre('deux_d');
faux.enLigne = false;
signe(d, { nom: 'Chadé', accord: 'signé' });
await attend(500);
ecritAilleurs('deux_d', 'x', F({ nom: 'Audrey' }));
await attend(200);
faux.enLigne = true;
leReseauRevient();
await attend(1800);
const D = { serveur: vue(auServeur('deux_d')), ecran: aLEcran(d), conflits: conflitsDe('deux_d') };

dit({ A, B, C, D });
