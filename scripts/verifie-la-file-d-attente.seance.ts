/* UNE SÉANCE DU TRÔNE, DANS SON PROPRE PROCESSUS — le harnais
   `verifie-la-file-d-attente` en lance une par ouverture de l'application.

   Elle branche la VRAIE synchronisation (`bindCollection`, `bindDocument`) sur
   un faux serveur dont la base survit entre les séances, joue les gestes qu'on
   lui donne (`GESTES`, JSON), attend, puis dit ce que porte le téléphone, ce
   que porte le serveur, la file et les conflits. `ETAPE=pur` éprouve l'arbitre
   seul, sans réseau. */
import { leReseauRevient } from './faux-stockage';
import { faux, ecritAilleurs, annonceLaSession } from './faux-supabase';
import { createStore } from '../src/shared/store';
import * as synchro from '../src/shared/sync';
/* Lu par l'espace de noms : la preuve « dans l'autre sens » rejoue ce harnais
   sur l'ancienne synchro, qui n'a pas `reprendsMaVersion`. */
const { bindCollection, bindDocument } = synchro;
const reprendsMaVersion = (synchro as { reprendsMaVersion?: (c: unknown) => boolean }).reprendsMaVersion ?? (() => false);
import { laPorteARepondu } from '../src/shared/auth';
import { arbitre, gestesEntre, recus, leGesteLocalTient, gestesEnAttente, lisLesConflits, type Entree } from '../src/shared/file-d-attente';
import * as laFile from '../src/shared/file-d-attente';
/* Les conflits NOTÉS, avant le filtre de lecture (absent de l'ancienne file). */
const conflitsNotes = (laFile as { lisLesConflitsNotes?: () => unknown[] }).lisLesConflitsNotes ?? lisLesConflits;
import { contenuCanonique } from '../src/shared/meme-contenu';
import { envoieSurWhatsApp } from '../src/shared/whatsapp';
import { appelsEnAttente, lisLesRefus } from '../src/shared/appels-en-attente';

type Rdv = { id: string; branchId: string; nom: string };
const T = 'essais';
const attend = (ms: number) => new Promise((r) => setTimeout(r, ms));
const dit = (x: unknown) => { console.log(`RESULTAT ${JSON.stringify(x)}`); process.exit(0); };

if (process.env.ETAPE === 'pur') {
  const s = (id: string, nom: string): Rdv => ({ id, branchId: 'b', nom });
  const j = (r: Rdv) => JSON.stringify(r);
  const at = (n: number) => new Date(Date.UTC(2026, 9, 4, 12, n)).toISOString();
  const serveur = [s('a', 'A'), s('b', 'B'), s('c', 'C')];
  const quand = new Map([['a', at(10)], ['b', at(10)], ['c', at(10)]]);
  const file = new Map<string, Entree>([
    ['a', { op: 'set', at: at(20), j: j(s('a', 'A-tel')) }],      // plus récent : gagne
    ['b', { op: 'set', at: at(5), j: j(s('b', 'B-tel')) }],       // plus ancien : conflit
    ['c', { op: 'del', at: at(20) }],                              // suppression plus récente
    ['d', { op: 'set', at: at(1), j: j(s('d', 'D-neuf')) }],      // ligne neuve
    ['e', { op: 'del', at: at(1) }],                               // déjà absente
  ]);
  const a = arbitre(serveur, quand, file, contenuCanonique);
  const sansHeure = arbitre(serveur, null, new Map([['b', file.get('b')!]]), contenuCanonique);
  const deja = arbitre(serveur, quand, new Map<string, Entree>([['a', { op: 'set', at: at(1), j: j(s('a', 'A')) }]]), contenuCanonique);
  dit({
    items: Object.fromEntries(a.items.map((x) => [x.id, x.nom])),
    aPousser: a.aPousser.sort(), finis: a.finis.sort(),
    conflits: a.conflits.map((c) => [c.id, c.notre && JSON.parse(c.notre).nom, JSON.parse(c.leur).nom]),
    sansHeure: [sansHeure.items.find((x) => x.id === 'b')?.nom, sansHeure.conflits.length],
    deja: [deja.finis, deja.aPousser],
    gestes: [...gestesEntre(new Map([['x', '1'], ['y', '2']]), new Map([['x', '1b'], ['z', '3']]), at(0))].map(([id, e]) => [id, e.op]),
    recus: recus(new Map<string, Entree>([['x', { op: 'set', at: at(0), j: '1b' }], ['y', { op: 'set', at: at(0), j: 'autre' }], ['w', { op: 'del', at: at(0) }]]), new Map([['x', '1b'], ['y', '2']])).sort(),
    tient: [leGesteLocalTient({ op: 'set', at: at(20) }, at(10)), leGesteLocalTient({ op: 'set', at: at(5) }, at(10)), leGesteLocalTient({ op: 'set', at: at(5) }, undefined)],
  });
}

/* UN CONFLIT DE RÉGLAGE DÉJÀ TRANCHÉ — 17 octobre 2026. Le conflit du Wi-Fi
   (« MAISON » gardé, « MAISON_ » écarté) ; le réglage porte aujourd'hui
   `WIFI`. Tranché (on a tapé jusqu'au bout) : il ne se demande plus ; la
   version gardée encore là : il reste montré. Par le lecteur de la synchro,
   et par la copie de l'appareil quand l'écran n'est pas chargé. */
if (process.env.ETAPE === 'tranche-doc') {
  const wifi = process.env.WIFI!;
  const reglage = createStore<{ v: number; wifiSsid?: string }>('mnd_reglage_essai', { v: 0 });
  reglage.set({ wifiSsid: wifi, v: 0 });
  if (process.env.LECTEUR === '1') bindDocument(reglage, 'reglage_essai');
  laFile.noteLesConflits([{
    table: 'documents', id: 'reglage_essai', ...(process.env.LECTEUR === '1' ? {} : { magasin: 'mnd_reglage_essai' }),
    notre: JSON.stringify({ wifiSsid: 'MAISON_', v: 0 }), notreAt: '2026-10-16T14:09:00.000Z',
    /* Noté à l'instant : un conflit de plus d'une semaine se tait de lui-même
       (29 octobre 2026), ce n'est pas ce que K éprouve. */
    leur: JSON.stringify({ v: 0, wifiSsid: 'MAISON' }), leurAt: '2026-10-16T14:09:01.000Z', vuLe: new Date().toISOString(),
  }]);
  dit({ montres: lisLesConflits().length });
}

if (process.env.ETAPE === 'ailleurs-doc') {
  /* Un AUTRE poste change le réglage pendant que ce téléphone est éteint. */
  ecritAilleurs('documents', 'reglage_essai', { v: Number(process.env.V) });
  dit({ ok: true });
}

if (process.env.ETAPE === 'ailleurs') {
  /* Un AUTRE poste écrit au serveur pendant que ce téléphone est éteint. */
  ecritAilleurs(T, process.env.ID!, { id: process.env.ID!, branchId: 'b', nom: process.env.NOM! });
  dit({ ok: true });
}

/* La porte de connexion répond tôt dans le vrai Trône : la séance fait de même. */
laPorteARepondu();
const store = createStore<Rdv[]>('mnd_essais', []);
const doc = createStore<{ v: number; wifiSsid?: string }>('mnd_reglage_essai', { v: 0 });
bindCollection(store, T);
bindDocument(doc, 'reglage_essai');
await attend(Number(process.env.AVANT ?? 900));

let dernier: unknown = null;
let reculs = 0;
let vuWifi = doc.get().wifiSsid ?? '';
doc.subscribe(() => {
  const w = doc.get().wifiSsid ?? '';
  if (w.length < vuWifi.length && vuWifi.startsWith(w)) reculs += 1;
  vuWifi = w;
});
const gestes = JSON.parse(process.env.GESTES ?? '[]') as [string, ...string[]][];
for (const [quoi, a, b] of gestes) {
  if (quoi === 'set') store.set((prev) => [...prev.filter((r) => r.id !== a), { id: a, branchId: 'b', nom: b }]);
  if (quoi === 'del') store.set((prev) => prev.filter((r) => r.id !== a));
  if (quoi === 'doc') doc.set({ v: Number(a) });
  /* Le magasin prévient sans que rien ait changé (un autre onglet, une purge). */
  if (quoi === 'touche') doc.set((p) => ({ ...p }));
  /* UNE FRAPPE DANS UN RÉGLAGE, lettre à lettre (le nom du Wi-Fi, 16 octobre) :
     le champ du document est écrit AVANT `v`, comme un écran le ferait. */
  if (quoi === 'frappe') {
    for (let i = 1; i <= a.length; i++) {
      doc.set((p) => ({ wifiSsid: a.slice(0, i), v: p.v }));
      /* Le jeton se renouvelle au milieu de la frappe (la lettre en vol). */
      if (i === Math.ceil(a.length / 2) && process.env.JETON_MS) { await attend(Number(process.env.JETON_MS)); annonceLaSession('TOKEN_REFRESHED'); }
      await attend(Number(b));
    }
  }
  if (quoi === 'ailleurs') ecritAilleurs(T, a, { id: a, branchId: 'b', nom: b });
  if (quoi === 'docailleurs') ecritAilleurs('documents', 'reglage_essai', { v: Number(a) });
  if (quoi === 'online') { faux.enLigne = true; leReseauRevient(); }
  if (quoi === 'pause') await attend(Number(a));
  if (quoi === 'reprendre') reprendsMaVersion(lisLesConflits()[0]);
  if (quoi === 'whatsapp') dernier = await envoieSurWhatsApp({ numero: '+229 01 90 00 00 01', texte: a, branchId: 'b' } as never);
  await attend(Number(process.env.ENTRE ?? 20));
}
await attend(Number(process.env.APRES ?? 1500));

dit({
  serveur: Object.fromEntries([...(faux.base.get(T)?.values() ?? [])].map((l) => [l.id, (l.data as Rdv).nom])),
  local: Object.fromEntries(store.get().map((r) => [r.id, r.nom])),
  attente: gestesEnAttente(),
  conflits: lisLesConflits().map((c) => [c.table, c.id, c.notre ? (JSON.parse(c.notre) as Rdv).nom ?? (JSON.parse(c.notre) as { v: number }).v : null, (JSON.parse(c.leur) as Rdv | null)?.nom ?? (JSON.parse(c.leur) as { v?: number } | null)?.v]),
  doc: doc.get().v,
  wifi: doc.get().wifiSsid ?? null,
  wifiServeur: (faux.base.get('documents')?.get('reglage_essai')?.data as { wifiSsid?: string } | undefined)?.wifiSsid ?? null,
  conflitsNotes: conflitsNotes().length,
  /* Tout ce que le champ a montré pendant la frappe : il ne doit jamais reculer. */
  reculs: reculs,
  docServeur: (faux.base.get('documents')?.get('reglage_essai')?.data as { v?: number } | undefined)?.v ?? null,
  envois: appelsEnAttente(),
  refus: lisLesRefus().length,
  refusDits: lisLesRefus().map((r) => r.refus),
  recus: [...(faux.base.get('__appels')?.values() ?? [])].sort((x, y) => (x.updated_at < y.updated_at ? -1 : 1)).map((l) => ((l.data as { corps?: { texte?: string } }).corps?.texte ?? '')),
  dernier,
});
