/* UNE SÉANCE DU TRÔNE, DANS SON PROPRE PROCESSUS — le harnais
   `verifie-la-file-d-attente` en lance une par ouverture de l'application.

   Elle branche la VRAIE synchronisation (`bindCollection`, `bindDocument`) sur
   un faux serveur dont la base survit entre les séances, joue les gestes qu'on
   lui donne (`GESTES`, JSON), attend, puis dit ce que porte le téléphone, ce
   que porte le serveur, la file et les conflits. `ETAPE=pur` éprouve l'arbitre
   seul, sans réseau. */
import { leReseauRevient } from './faux-stockage';
import { faux, ecritAilleurs } from './faux-supabase';
import { createStore } from '../src/shared/store';
import * as synchro from '../src/shared/sync';
/* Lu par l'espace de noms : la preuve « dans l'autre sens » rejoue ce harnais
   sur l'ancienne synchro, qui n'a pas `reprendsMaVersion`. */
const { bindCollection, bindDocument } = synchro;
const reprendsMaVersion = (synchro as { reprendsMaVersion?: (c: unknown) => boolean }).reprendsMaVersion ?? (() => false);
import { laPorteARepondu } from '../src/shared/auth';
import { arbitre, gestesEntre, recus, leGesteLocalTient, gestesEnAttente, lisLesConflits, type Entree } from '../src/shared/file-d-attente';
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

if (process.env.ETAPE === 'ailleurs') {
  /* Un AUTRE poste écrit au serveur pendant que ce téléphone est éteint. */
  ecritAilleurs(T, process.env.ID!, { id: process.env.ID!, branchId: 'b', nom: process.env.NOM! });
  dit({ ok: true });
}

/* La porte de connexion répond tôt dans le vrai Trône : la séance fait de même. */
laPorteARepondu();
const store = createStore<Rdv[]>('mnd_essais', []);
const doc = createStore<{ v: number }>('mnd_reglage_essai', { v: 0 });
bindCollection(store, T);
bindDocument(doc, 'reglage_essai');
await attend(Number(process.env.AVANT ?? 900));

let dernier: unknown = null;
const gestes = JSON.parse(process.env.GESTES ?? '[]') as [string, ...string[]][];
for (const [quoi, a, b] of gestes) {
  if (quoi === 'set') store.set((prev) => [...prev.filter((r) => r.id !== a), { id: a, branchId: 'b', nom: b }]);
  if (quoi === 'del') store.set((prev) => prev.filter((r) => r.id !== a));
  if (quoi === 'doc') doc.set({ v: Number(a) });
  if (quoi === 'ailleurs') ecritAilleurs(T, a, { id: a, branchId: 'b', nom: b });
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
  docServeur: (faux.base.get('documents')?.get('reglage_essai')?.data as { v?: number } | undefined)?.v ?? null,
  envois: appelsEnAttente(),
  refus: lisLesRefus().length,
  recus: [...(faux.base.get('__appels')?.values() ?? [])].sort((x, y) => (x.updated_at < y.updated_at ? -1 : 1)).map((l) => ((l.data as { corps?: { texte?: string } }).corps?.texte ?? '')),
  dernier,
});
