/* LE GESTE CONFIRMÉ PENDANT LA LECTURE — une séance, lancée par
   `verifie-le-direct-pendant-la-lecture.mjs` (17 novembre 2026, revue de la
   salle d'attente des envois).

   La VRAIE synchronisation (`bindCollection`) sur le faux serveur
   (`faux-supabase.ts`), dont les lectures prennent leur photo À LA DEMANDE et
   répondent tard (`FAUX_LECTURE_TOT=1`, `FAUX_LATENCE_MS`). `ETAPE` :
     - `geste` (défaut) :
       B. une ligne confirmée par `appliqueCommeLeDirect` (la réponse d'une
          écriture de la salle) n'est plus défaite par une lecture de toute la
          table partie AVANT elle : la lecture est jetée et refaite ;
       D. la réponse d'une écriture se tait si le direct a apporté, pendant
          son vol, une écriture PLUS RÉCENTE de la ligne ;
       D2. … mais pas pour un écho en retard de l'état d'avant (le geste
          précédent qui revient), ni pour l'écho de notre propre écriture ;
       B3. une réponse ainsi devancée rend quand même dépassée la lecture en
          vol (sa photo d'avant aurait défait le direct plus récent) ;
       B4. une rafale de vingt confirmations pendant une lecture ne relit la
          table qu'une fois après elle (la seconde revue : une relecture à
          chaque réponse, sans fin, pendant « Effacer les 48 ») ;
       B2. un magasin qui s'ouvre, canal déjà là : une ligne confirmée
          pendant sa PREMIÈRE lecture reste (la première lecture n'était pas
          gardée par la règle) ;
       E. une lecture sans geste pendant son vol s'applique comme avant.
     - `echo` : deux frappes sur la même ligne, le direct plus lent que la
       lecture ; l'écho de la PREMIÈRE frappe arrive pendant une lecture
       partie après la seconde. L'écran et le serveur finissent sur la
       seconde (la revue du correctif a montré qu'une lecture « recouverte »
       par le direct reculait ici, puis perdait la frappe au serveur).
   Les lignes sont inventées. */
import './faux-stockage';
import { faux, ecritAilleurs, annonceLaSession, supabase as fauxServeur } from './faux-supabase';
import { createStore } from '../src/shared/store';
import * as synchro from '../src/shared/sync';
import { laPorteARepondu } from '../src/shared/auth';

type Ligne = { id: string; branchId: string; statut: string };
const attend = (ms: number) => new Promise((r) => setTimeout(r, ms));
const LATENCE = Number(process.env.LATENCE ?? 400);
/* Lu par l'espace de noms : la preuve « dans l'autre sens » rejoue cette
   séance sur la synchro d'avant, qui n'a pas `repereDuDirect`. */
type Repere = { n: number; avant: unknown };
const appliqueCommeLeDirect = synchro.appliqueCommeLeDirect as (t: string, l: { id: string; data: unknown }, depuis?: Repere) => boolean | void;
const repereDuDirect = (synchro as { repereDuDirect?: (t: string, avant: unknown) => Repere }).repereDuDirect ?? ((_t: string, avant: unknown) => ({ n: 0, avant }));
const L = (id: string, statut: string): Ligne => ({ id, branchId: 'b', statut });
const statutDe = (s: { get: () => Ligne[] }, id: string): string | null => s.get().find((x) => x.id === id)?.statut ?? null;
const dit = (x: unknown) => { console.log(`RESULTAT ${JSON.stringify(x)}`); process.exit(0); };
laPorteARepondu();

if (process.env.ETAPE === 'echo') {
  ecritAilleurs('essai_e', 'x', L('x', 'A'));
  const s = createStore<Ligne[]>('mnd_essai_e', []);
  synchro.bindCollection(s, 'essai_e');
  await attend(LATENCE * 3 + 1200);
  const hydrate = statutDe(s, 'x');
  const auServeur = () => (faux.base.get('essai_e')!.get('x') as { data: Ligne }).data.statut;
  const jusqua = async (v: string) => { for (let i = 0; i < 1000 && auServeur() !== v; i++) await attend(5); return Date.now(); };
  const t0 = Date.now();
  if (process.env.TRACE) {
    s.subscribe(() => console.log(`TRACE +${Date.now() - t0} ms écran ${statutDe(s, 'x')}`));
    faux.ecoutes.add((p: Record<string, unknown>) => console.log(`TRACE +${Date.now() - t0} ms direct ${String((p.new as { data?: Ligne })?.data?.statut ?? '')}`));
  }
  s.set((p) => p.map((x) => (x.id === 'x' ? { ...x, statut: 'B' } : x)));
  const recuB = await jusqua('B');
  if (process.env.TRACE) console.log(`TRACE +${recuB - t0} ms B au serveur`);
  s.set((p) => p.map((x) => (x.id === 'x' ? { ...x, statut: 'C' } : x)));
  await jusqua('C');
  /* La seconde frappe est au serveur ; l'écho de la première voyage encore,
     il arrive à `recuB + ECHO`. La lecture part juste avant et répond juste
     après : son vol l'enjambe, à coup sûr. */
  const ECHO = Number(process.env.FAUX_ECHO_MS ?? 5);
  await attend(Math.max(0, recuB + ECHO - LATENCE / 2 - Date.now()));
  const lectureLe = Date.now() - recuB;
  if (process.env.TRACE) console.log(`TRACE +${Date.now() - t0} ms la lecture part`);
  annonceLaSession('TOKEN_REFRESHED');
  await attend(ECHO + LATENCE * 2 + 1500);
  if (process.env.TRACE) console.log(`TRACE lecture partie ${lectureLe} ms après B au serveur ; écho de B à ${ECHO} ms`);
  dit({ hydrate, ecran: statutDe(s, 'x'), serveur: (faux.base.get('essai_e')!.get('x') as { data: Ligne }).data.statut });
}

for (const [t, id] of [['essai_b', 'y'], ['essai_a', 'v'], ['essai_c', 'z'], ['essai_c', 'u'], ['essai_c', 't']] as const) {
  ecritAilleurs(t, id, L(id, 'en-attente'));
}
const a = createStore<Ligne[]>('mnd_essai_a', []);
const b = createStore<Ligne[]>('mnd_essai_b', []);
const c = createStore<Ligne[]>('mnd_essai_c', []);
synchro.bindCollection(a, 'essai_a');
synchro.bindCollection(b, 'essai_b');
synchro.bindCollection(c, 'essai_c');
await attend(LATENCE * 3 + 600);
const hydrate = [statutDe(b, 'y'), statutDe(c, 'z'), statutDe(c, 'u')];

/* ── B. La lecture part (le jeton renouvelé relit chaque table), photo
   prise ; la salle écrit sous condition pendant son vol, le direct à terre
   (rien n'est diffusé), et la réponse s'applique comme le direct. ── */
annonceLaSession('TOKEN_REFRESHED');
await attend(40);
faux.base.get('essai_b')!.set('y', { id: 'y', branch_id: 'b', data: L('y', 'retenu'), updated_at: new Date().toISOString() });
appliqueCommeLeDirect('essai_b', { id: 'y', data: L('y', 'retenu') });
await attend(30);
const pendant = statutDe(b, 'y');
await attend(LATENCE * 3 + 900);
const apres = statutDe(b, 'y');

/* ── D. Un direct plus récent, arrivé avant la réponse ── */
let r = repereDuDirect('essai_c', L('z', 'en-attente'));
ecritAilleurs('essai_c', 'z', L('z', 'en-envoi'));
await attend(60);
const tue = appliqueCommeLeDirect('essai_c', { id: 'z', data: L('z', 'retenu') }, r);
await attend(20);
const apresVieilleReponse = statutDe(c, 'z');
r = repereDuDirect('essai_c', L('z', 'en-envoi'));
const neuve = appliqueCommeLeDirect('essai_c', { id: 'z', data: L('z', 'envoyé') }, r);
await attend(20);
const apresReponseFraiche = statutDe(c, 'z');

/* ── D2. L'écho en retard de l'état d'avant, puis celui de notre écriture ── */
appliqueCommeLeDirect('essai_c', { id: 'u', data: L('u', 'retenu') });
await attend(20);
r = repereDuDirect('essai_c', L('u', 'retenu'));
/* L'écho du « Retenir » d'avant arrive pendant le vol du « Relâcher »… */
ecritAilleurs('essai_c', 'u', L('u', 'retenu'));
await attend(60);
const echoDAvant = appliqueCommeLeDirect('essai_c', { id: 'u', data: L('u', 'en-attente') }, r);
await attend(20);
const apresEchoDAvant = statutDe(c, 'u');
r = repereDuDirect('essai_c', L('u', 'en-attente'));
/* … puis l'écho de notre propre écriture, avant sa réponse. */
ecritAilleurs('essai_c', 'u', L('u', 'écarté'));
await attend(60);
const notreEcho = appliqueCommeLeDirect('essai_c', { id: 'u', data: L('u', 'écarté') }, r);
await attend(20);
const apresNotreEcho = statutDe(c, 'u');

/* ── B3. Une réponse devancée par le direct, une lecture en vol : la lecture
   (photo d'avant) ne défait pas le direct plus récent ── */
annonceLaSession('TOKEN_REFRESHED');
await attend(40);
r = repereDuDirect('essai_c', L('t', 'en-attente'));
ecritAilleurs('essai_c', 't', L('t', 'en-envoi'));
await attend(60);
const devancee = appliqueCommeLeDirect('essai_c', { id: 't', data: L('t', 'retenu') }, r);
await attend(LATENCE * 3 + 900);
const apresDevancee = statutDe(c, 't');

/* ── B4. Une rafale de confirmations pendant une lecture : une seule
   relecture après elle, pas une à chaque réponse ── */
const serveur = fauxServeur as unknown as { from: (t: string) => { select: (col?: string) => unknown } };
const from0 = serveur.from.bind(serveur);
let lecturesDeB = 0;
serveur.from = (t: string) => {
  const q = from0(t);
  const sel = q.select.bind(q);
  q.select = (col?: string) => { if (t === 'essai_b' && col === 'id,data') lecturesDeB += 1; return sel(col); };
  return q;
};
annonceLaSession('TOKEN_REFRESHED');
await attend(40);
const avantLaRafale = lecturesDeB;
for (let i = 0; i < 20; i++) {
  const id = `r${i}`;
  faux.base.get('essai_b')!.set(id, { id, branch_id: 'b', data: L(id, 'écarté'), updated_at: new Date().toISOString() });
  appliqueCommeLeDirect('essai_b', { id, data: L(id, 'écarté') });
  await attend(120);
}
await attend(LATENCE * 2 + 1500);
const lecturesPendantLaRafale = lecturesDeB - avantLaRafale;
serveur.from = from0;
const rafaleAuMagasin = b.get().filter((x) => x.id.startsWith('r') && x.statut === 'écarté').length;

/* ── B2. Un magasin qui s'ouvre, le canal déjà là : sa première lecture
   vole seule, une ligne confirmée pendant ce temps reste ── */
ecritAilleurs('essai_f', 'p', L('p', 'en-attente'));
const f = createStore<Ligne[]>('mnd_essai_f', []);
synchro.bindCollection(f, 'essai_f');
await attend(60);
faux.base.get('essai_f')!.set('p', { id: 'p', branch_id: 'b', data: L('p', 'retenu'), updated_at: new Date().toISOString() });
appliqueCommeLeDirect('essai_f', { id: 'p', data: L('p', 'retenu') });
await attend(LATENCE * 3 + 1200);
const premiereLectureApres = statutDe(f, 'p');

/* ── E. Une lecture sans geste pendant son vol s'applique ── */
faux.base.get('essai_a')!.set('v', { id: 'v', branch_id: 'b', data: L('v', 'écarté'), updated_at: new Date().toISOString() });
annonceLaSession('TOKEN_REFRESHED');
await attend(LATENCE * 2 + 3200);
const lectureSeule = statutDe(a, 'v');

dit({ hydrate, pendant, apres, tue, apresVieilleReponse, neuve, apresReponseFraiche, echoDAvant, apresEchoDAvant, notreEcho, apresNotreEcho,
  devancee, apresDevancee, lecturesPendantLaRafale, rafaleAuMagasin, premiereLectureApres, lectureSeule });
