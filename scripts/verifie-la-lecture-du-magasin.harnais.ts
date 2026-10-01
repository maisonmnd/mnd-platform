/* LIRE NE RELIT PLUS LE DISQUE, EPROUVE — `node scripts/verifie-la-lecture-du-magasin.mjs`.

   Le 1er octobre 2026, le banc de la barre a compte, pour UN clic dans la
   navigation du Trone, jusqu'a 17 000 lectures de la memoire du navigateur et
   trente megaoctets relus. La regle : la memoire fait foi, le disque ne se
   relit que si quelqu'un d'autre a pu y ecrire (un autre onglet, une purge,
   une ecriture directe annoncee). Ce harnais compte les lectures du disque,
   et verifie que chacune des trois portes rouvre bien la lecture. */
import { createStore, purgeLocalKeys, relisLeDisque, magasinsEnMemoireSeule, cleDeSurface } from '../src/shared/store';
import {
  peseLesCases, resumeDeLaMemoire, ditLePoids, PLACE_ACCORDEE, PART_QUI_INQUIETE,
  noteUneEcritureRecue, ecrituresRecues, oublieLesEcrituresRecues,
} from '../src/shared/poids-de-la-memoire';

declare const __disque: { lus: number; refuse: Set<string>; donnees: Map<string, string> };

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};
/** Combien de fois le disque a ete lu pendant ce geste. */
const lectures = (geste: () => void): number => { const avant = __disque.lus; geste(); return __disque.lus - avant; };
const autreOnglet = (cle: string | null, valeur?: unknown) => {
  if (cle !== null) __disque.donnees.set(cle, JSON.stringify(valeur));
  const e = new Event('storage') as Event & { key: string | null };
  e.key = cle;
  window.dispatchEvent(e);
};

type Fiche = { id: string; nom: string };
const table = (n: number): Fiche[] => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, nom: `Cliente ${i}` }));

/* ── 1. La regle : lire ne coute rien au disque ── */
{
  const m = createStore<Fiche[]>('mnd_essai_lecture', []);
  m.set(table(500));
  dit('mille lectures apres une ecriture : le disque n est pas relu', 0, lectures(() => { for (let i = 0; i < 1000; i += 1) m.get(); }));
  dit('... et la valeur est la bonne', 500, m.get().length);
  dit('... la meme, lecture apres lecture (un ecran ne se redessine pas pour rien)', true, m.get() === m.get());
}

/* ── 2. Au demarrage : une seule lecture du disque, puis plus aucune ── */
{
  __disque.donnees.set(cleDeSurface('mnd_essai_demarrage'), JSON.stringify(table(3)));
  const m = createStore<Fiche[]>('mnd_essai_demarrage', []);
  dit('la premiere lecture va au disque, une fois', 1, lectures(() => { m.get(); }));
  dit('... les cent suivantes, non', 0, lectures(() => { for (let i = 0; i < 100; i += 1) m.get(); }));
  dit('... et ce qui etait au disque est rendu', ['c0', 'c1', 'c2'], m.get().map((f) => f.id));
}

/* ── 3. Premiere porte : un autre onglet a ecrit ── */
{
  const m = createStore<Fiche[]>('mnd_essai_onglet', []);
  m.set(table(2));
  let prevenu = 0;
  m.subscribe(() => { prevenu += 1; });
  autreOnglet(cleDeSurface('mnd_essai_onglet'), table(7));
  dit('l ecran est prevenu', 1, prevenu);
  dit('la lecture suivante rend ce que l autre onglet a ecrit', 7, m.get().length);
  dit('... au prix d une seule lecture du disque', 0, lectures(() => { for (let i = 0; i < 50; i += 1) m.get(); }));
  autreOnglet(cleDeSurface('mnd_autre_magasin'), table(1));
  dit('l ecriture d une AUTRE case ne fait rien relire', 0, lectures(() => { m.get(); }));
  __disque.donnees.delete(cleDeSurface('mnd_essai_onglet'));
  autreOnglet(null);
  dit('un autre onglet qui vide tout rend la semence', [], m.get());
}

/* ── 4. Deuxieme porte : la purge de deconnexion ── */
{
  const m = createStore<Fiche[]>('mnd_essai_purge', []);
  m.set(table(4));
  purgeLocalKeys(['mnd_essai_purge']);
  dit('apres la purge, la semence revient', [], m.get());
  m.set(table(1));
  dit('... et le magasin se remplit de nouveau', 1, m.get().length);
}

/* ── 5. Troisieme porte : une ecriture directe, annoncee ── */
{
  const m = createStore<{ nom: string }>('mnd_essai_direct', { nom: 'semence' });
  m.set({ nom: 'par le magasin' });
  __disque.donnees.set(cleDeSurface('mnd_essai_direct'), JSON.stringify({ nom: 'ecrit a la main' }));
  dit('une ecriture directe NON annoncee ne se voit pas (c est la regle, et sa raison d etre)', 'par le magasin', m.get().nom);
  relisLeDisque();
  dit('annoncee, elle se voit', 'ecrit a la main', m.get().nom);
}

/* ── 6. Deux magasins sur la meme case se repondent ── */
{
  const a = createStore<number>('mnd_essai_double', 0);
  const b = createStore<number>('mnd_essai_double', 0);
  b.get();
  a.set(41);
  dit('ce que l un ecrit, l autre le lit', 41, b.get());
  b.set((n) => n + 1);
  dit('... et inversement, sur la valeur courante', 42, a.get());
}

/* ── 7. Le disque plein : le geste passe, la memoire fait foi ── */
{
  const m = createStore<Fiche[]>('mnd_essai_plein', []);
  m.set(table(2));
  __disque.refuse.add(cleDeSurface('mnd_essai_plein'));
  let prevenu = 0;
  m.subscribe(() => { prevenu += 1; });
  m.set(table(9));
  dit('l ecriture refusee par le disque est gardee en memoire', 9, m.get().length);
  dit('... l ecran est prevenu quand meme', 1, prevenu);
  dit('... le magasin est dit sature', true, magasinsEnMemoireSeule().includes('mnd_essai_plein'));
  dit('... et rien de perime ne reste au disque', false, __disque.donnees.has(cleDeSurface('mnd_essai_plein')));
  __disque.refuse.delete(cleDeSurface('mnd_essai_plein'));
  m.set(table(3));
  dit('quand le disque accepte de nouveau, le magasin n est plus dit sature', false, magasinsEnMemoireSeule().includes('mnd_essai_plein'));
  dit('... et le disque porte la valeur', 3, (JSON.parse(__disque.donnees.get(cleDeSurface('mnd_essai_plein')) ?? '[]') as Fiche[]).length);
}

/* ── 8. Une case vide rend la semence, sans rien retenir de faux ── */
{
  const m = createStore<string[]>('mnd_essai_vide', ['semence']);
  dit('une case vide rend la semence', ['semence'], m.get());
  __disque.donnees.set(cleDeSurface('mnd_essai_vide'), JSON.stringify(['arrive ensuite']));
  autreOnglet(cleDeSurface('mnd_essai_vide'), ['arrive ensuite']);
  dit('... et ce qui arrive ensuite se lit', ['arrive ensuite'], m.get());
}

/* ── 9. Ce que ce poste garde : la pesee ── */
{
  const cases: [string, string][] = [
    ['trone::mnd_appointments', 'r'.repeat(900)],
    ['trone::mnd_clients', 'f'.repeat(3000)],
    ['couronne::mnd_clients', 'c'.repeat(120)],
    ['mnd_reset_v5', '1'],
    ['trone::mnd_house_identity', 'i'.repeat(40)],
  ];
  const { cases: pesees, total } = peseLesCases(cases);
  dit('les cases se rangent de la plus lourde a la plus legere', ['fiches clientes', 'rendez-vous', 'fiches clientes', 'house identity', 'reset v5'], pesees.map((c) => c.nom));
  dit('... chacune dit sa surface', ['Le Trône', 'Le Trône', 'Ma Couronne', 'Le Trône', 'le site'], pesees.map((c) => c.surface));
  dit('... la cle pese avec sa valeur', 'trone::mnd_clients'.length + 3000, pesees[0].caracteres);
  dit('... et le total est la somme', cases.reduce((n, [k, v]) => n + k.length + v.length, 0), total);
  dit('la pesee ne depend pas de l ordre de lecture', pesees.map((c) => c.cle), peseLesCases([...cases].reverse()).cases.map((c) => c.cle));
  dit('un kilo fait mille vingt-quatre caracteres', '2 Ko', ditLePoids(2048));
  dit('... et les milliers se separent', '4\u202f883 Ko', ditLePoids(5_000_000));
  const juste = Math.ceil(PLACE_ACCORDEE * PART_QUI_INQUIETE);
  dit('sous le seuil, la memoire ne s inquiete pas', false, resumeDeLaMemoire([['trone::mnd_clients', 'x'.repeat(juste - 100)]]).presDuBout);
  dit('au seuil, elle le dit', true, resumeDeLaMemoire([['trone::mnd_clients', 'x'.repeat(juste)]]).presDuBout);
  dit('le resume ne garde que les plus lourdes', 2, resumeDeLaMemoire(cases, 2).lourdes.length);
}

/* ── 10. Ce que les autres postes envoient : le compteur d'une minute ── */
{
  oublieLesEcrituresRecues();
  const t0 = 10_000_000;
  dit('rien recu : rien a dire', [], ecrituresRecues(60_000, t0));
  for (let i = 0; i < 12; i += 1) noteUneEcritureRecue('clients', t0 + i * 1000);
  for (let i = 0; i < 3; i += 1) noteUneEcritureRecue('appointments', t0 + i * 1000);
  dit('douze fiches et trois rendez-vous recus : la table la plus bavarde d abord', [{ table: 'clients', n: 12 }, { table: 'appointments', n: 3 }], ecrituresRecues(60_000, t0 + 12_000));
  /* A t0 + 70 s, la minute court de t0 + 10 s (exclu) a t0 + 70 s : seule la fiche recue a t0 + 11 s y tient. */
  dit('une minute plus tard, la fenetre a glisse : il ne reste que la derniere fiche', [{ table: 'clients', n: 1 }], ecrituresRecues(60_000, t0 + 70_000));
  dit('deux minutes plus tard, plus rien', [], ecrituresRecues(60_000, t0 + 180_000));
  for (let i = 0; i < 5000; i += 1) noteUneEcritureRecue('clients', t0 + 200_000 + i);
  dit('le compteur ne grossit pas sans fin', true, ecrituresRecues(60_000, t0 + 206_000).reduce((n, r) => n + r.n, 0) <= 2000);
}

console.log(ko === 0 ? '\nLe magasin lit en memoire, et relit quand il le faut.' : `\n${ko} controle(s) en echec.`);
process.exit(ko === 0 ? 0 : 1);
