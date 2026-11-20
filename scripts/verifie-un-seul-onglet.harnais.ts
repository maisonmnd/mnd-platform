/* UN SEUL ONGLET DU TRÔNE TIENT LA MAIN — une séance, lancée par
   `verifie-un-seul-onglet.mjs` (20 novembre 2026, le choix « A » de Yéman).

   `ETAPE` :
     - `main` : cet onglet prend la main ; un autre onglet la prend à son tour
       (l'événement `storage`) : celui-ci se met en pause (noté dans sa
       session, rechargé une fois), puis n'écrit plus rien — ni magasin, ni
       file d'attente, ni conflit ;
     - `course` : deux onglets écrivent à la même seconde ; l'événement arrive
       mais la case porte encore NOTRE identifiant : on garde la main ;
     - `retour` : l'événement s'est perdu ; au retour sur l'onglet (focus),
       la case dit un autre : pause ;
     - `rechargé` (avec FAUX_PAUSE=1) : l'onglet rechargé en pause ne prend
       pas la main, ne lit rien au serveur et ne se branche à rien ; « Utiliser
       ici » retire la pause et recharge.
   Les lignes sont inventées. */
import './faux-stockage';
import { rechargements, laSession } from './faux-session';
import { faux, ecritAilleurs, supabase as fauxServeur } from './faux-supabase';
import { createStore } from '../src/shared/store';
import * as synchro from '../src/shared/sync';
import { laPorteARepondu } from '../src/shared/auth';
import { ecrisLaFile, lisLaFile, noteLesConflits, lisLesConflitsNotes } from '../src/shared/file-d-attente';
import { ongletEnPause, prendsLaMain, reprendsLaMain } from '../src/shared/onglet-actif';

const attend = (ms: number) => new Promise((r) => setTimeout(r, ms));
const dit = (x: unknown) => { console.log(`RESULTAT ${JSON.stringify(x)}`); process.exit(0); };
const CLE = 'trone::onglet-qui-tient-la-main';
const w = (globalThis as unknown as { window: { dispatchEvent: (e: unknown) => void } }).window;
const unAutreOngletPrendLaMain = (avecEvenement: boolean) => {
  localStorage.setItem(CLE, JSON.stringify({ id: 'autre-onglet', le: new Date().toISOString() }));
  if (avecEvenement) w.dispatchEvent({ type: 'storage', key: CLE });
};
const ETAPE = process.env.ETAPE ?? 'main';

if (ETAPE === 'main') {
  prendsLaMain('trone');
  const prise = JSON.parse(localStorage.getItem(CLE) ?? 'null') as { id?: string } | null;
  const s = createStore<{ id: string; v: string }[]>('mnd_essai_onglet', []);
  s.set([{ id: 'x', v: 'avant' }]);
  const avant = { pause: ongletEnPause(), magasin: s.get()[0]?.v ?? null };
  unAutreOngletPrendLaMain(true);
  const pendant = { pause: ongletEnPause(), session: laSession.get('mnd_onglet_en_pause') ?? null, rechargements: rechargements.n };
  /* En pause : plus rien ne s'écrit. */
  s.set([{ id: 'x', v: 'apres' }]);
  const fileAvant = localStorage.getItem('trone::file::essai_onglet');
  ecrisLaFile('essai_onglet', new Map([['x', { op: 'set', at: new Date().toISOString(), j: '{"id":"x"}' }]]));
  noteLesConflits([{ table: 'essai_onglet', id: 'x', notre: '{"id":"x","v":"a"}', notreAt: 'a', leur: '{"id":"x","v":"b"}', leurAt: 'b', vuLe: new Date().toISOString() }]);
  /* Un second événement ne recharge pas deux fois. */
  unAutreOngletPrendLaMain(true);
  dit({
    prise: typeof prise?.id === 'string' && prise.id !== 'autre-onglet',
    avant, pendant,
    magasinApres: s.get()[0]?.v ?? null,
    disqueApres: (JSON.parse(localStorage.getItem('trone::mnd_essai_onglet') ?? '[]') as { v: string }[])[0]?.v ?? null,
    fileIntacte: localStorage.getItem('trone::file::essai_onglet') === fileAvant,
    conflits: lisLesConflitsNotes().filter((c) => c.table === 'essai_onglet').length,
    rechargementsFin: rechargements.n,
  });
}

if (ETAPE === 'course') {
  prendsLaMain('trone');
  /* L'autre a écrit, puis nous par-dessus : la case porte notre identifiant. */
  const nous = localStorage.getItem(CLE);
  unAutreOngletPrendLaMain(false);
  localStorage.setItem(CLE, nous!);
  w.dispatchEvent({ type: 'storage', key: CLE });
  dit({ pause: ongletEnPause(), rechargements: rechargements.n });
}

if (ETAPE === 'retour') {
  prendsLaMain('trone');
  unAutreOngletPrendLaMain(false);
  const sansEvenement = ongletEnPause();
  w.dispatchEvent({ type: 'focus' });
  dit({ sansEvenement, auRetour: ongletEnPause(), rechargements: rechargements.n });
}

if (ETAPE === 'rechargé') {
  laPorteARepondu();
  ecritAilleurs('essai_pause', 'x', { id: 'x', branchId: 'b', v: 'serveur' });
  let lectures = 0;
  const from = fauxServeur.from;
  fauxServeur.from = (t: string) => { if (t === 'essai_pause' || t === 'documents') lectures += 1; return from(t); };
  const ecouteAvant = faux.ecoutes.size;
  const ecrituresAvant = faux.ecritures;
  prendsLaMain('trone');
  const s = createStore<{ id: string; v: string }[]>('mnd_essai_pause', []);
  synchro.bindCollection(s, 'essai_pause');
  const d = createStore<{ v: string }>('mnd_essai_doc', { v: 'local' });
  synchro.bindDocument(d, 'mnd_essai_doc');
  await attend(700);
  /* L'autre onglet écrit dans le stockage commun : cet onglet ne le prend
     pas pour un geste, il n'envoie rien. */
  localStorage.setItem('trone::mnd_essai_pause', JSON.stringify([{ id: 'x', branchId: 'b', v: 'autre-onglet' }]));
  w.dispatchEvent({ type: 'storage', key: 'trone::mnd_essai_pause' });
  await attend(700);
  const r = {
    pause: ongletEnPause(),
    prisLaMain: localStorage.getItem(CLE) !== null,
    lectures,
    branche: faux.ecoutes.size - ecouteAvant,
    ecritures: faux.ecritures - ecrituresAvant,
    file: lisLaFile('essai_pause').size,
  };
  reprendsLaMain();
  dit({ ...r, apresUtiliserIci: { session: laSession.get('mnd_onglet_en_pause') ?? null, rechargements: rechargements.n } });
}
