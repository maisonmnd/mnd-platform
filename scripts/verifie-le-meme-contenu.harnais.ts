/* LE CONTENU, PAS L'ORDRE DES CHAMPS, EPROUVE — `node scripts/verifie-le-meme-contenu.mjs`.

   Le 2 octobre 2026, le panneau « Cet appareil » a montre 289 fiches reecrites
   par minute sur un seul poste. La base range les champs d'un objet a sa
   facon (du nom le plus court au plus long, puis par ordre des lettres) ; les
   automatismes comparaient par le TEXTE de l'objet, qui suit l'ordre des
   champs. Le resume recalcule ne ressemblait jamais a celui revenu du serveur,
   et la fiche se reecrivait sans fin.

   Ce harnais rejoue l'aller-retour par la base sur le VRAI calcul du
   parrainage et des formules, et compte les reecritures : l'ancienne
   comparaison boucle, la nouvelle s'arrete. */
import { readFileSync, readdirSync } from 'node:fs';
import { contenuCanonique, memeContenu } from '../src/shared/meme-contenu';
import { lignees, resumeDeLAmbassade, classementDuMois } from '../src/shared/ambassade';
import { memesFormules, type FormuleRapide } from '../src/shared/reservation-express';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/** CE QUE LA BASE REND : le meme contenu, champs ranges du nom le plus court
    au plus long, puis par ordre des lettres. C'est la regle de son type de
    colonne, pas un choix du Trone. */
const commeLaBase = (v: unknown): unknown => {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(commeLaBase);
  const o = v as Record<string, unknown>;
  const cles = Object.keys(o).filter((k) => o[k] !== undefined)
    .sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(cles.map((k) => [k, commeLaBase(o[k])]));
};
const allerRetour = <T,>(v: T): T => commeLaBase(JSON.parse(JSON.stringify(v))) as T;

/* ── 1. La regle ── */
dit('deux objets aux champs ranges autrement disent la meme chose', true, memeContenu({ rang: 'tresse', venues: 2 }, { venues: 2, rang: 'tresse' }));
dit('... jusque dans les objets qu ils portent', true, memeContenu({ a: { x: 1, y: [{ p: 1, q: 2 }] } }, { a: { y: [{ q: 2, p: 1 }], x: 1 } }));
dit('une valeur differente reste une difference', false, memeContenu({ rang: 'tresse', venues: 2 }, { rang: 'tresse', venues: 3 }));
dit('un champ en plus reste une difference', false, memeContenu({ rang: 'tresse' }, { rang: 'tresse', venues: 0 }));
dit('l ordre d une LISTE porte un sens : il compte', false, memeContenu(['a', 'b'], ['b', 'a']));
dit('un champ absent et un champ indefini se valent, comme pour la base', true, memeContenu({ a: 1, b: undefined }, { a: 1 }));
dit('rien et zero ne se confondent pas', false, memeContenu({ a: null }, { a: 0 }));
dit('le nombre 2 n est pas le texte « 2 »', false, memeContenu({ a: 2 }, { a: '2' }));
dit('rien et rien se valent', true, memeContenu(null, null));
dit('le texte range ne depend pas de l ordre d ecriture', contenuCanonique({ b: 1, a: [{ d: 1, c: 2 }] }), contenuCanonique({ a: [{ c: 2, d: 1 }], b: 1 }));

/* ── 2. LA PANNE ELLE-MEME, sur le vrai resume du parrainage ── */
{
  const marraine = { id: 'm', name: 'Awa M', phone: '+2290151000001', since: '2026-01-10', codeParrain: 'AWA-K7M' };
  const f1 = { id: 'f1', name: 'Bintou B', phone: '+2290151000002', since: '2026-09-02', parraineePar: 'AWA-K7M', parraineeLe: '2026-09-02' };
  const f2 = { id: 'f2', name: 'Chantal C', phone: '+2290151000003', since: '2026-09-20', parraineePar: 'AWA-K7M', parraineeLe: '2026-09-20' };
  // deno-lint-ignore no-explicit-any
  const fiches = [marraine, f1, f2] as any[];
  const rdvs = [{ id: 'r1', status: 'honoré', date: '2026-09-05', clientId: 'f1' }];
  // deno-lint-ignore no-explicit-any
  const L = lignees(fiches, [], rdvs as any);
  const lignee = L.get('AWA-K7M');
  dit('la marraine a bien sa lignee (sans quoi ce banc ne prouverait rien)', 2, lignee?.filleules.length ?? 0);
  const resume = resumeDeLAmbassade(lignee!, L, fiches, {}, '2026-10-02');
  const revenu = allerRetour(resume);
  dit('le resume revient de la base avec ses champs ranges autrement', false, Object.keys(resume).join() === Object.keys(revenu).join());
  dit('L ANCIENNE COMPARAISON (par le texte) les croit differents : c est la panne', true, JSON.stringify(resume) !== JSON.stringify(revenu));
  dit('LA NOUVELLE les reconnait pour le meme contenu', true, memeContenu(resume, revenu));

  /* La boucle, comptee : dix passages de l'automatisme, chacun suivi d'un
     aller-retour par la base. Combien de fois reecrit-il la fiche ? */
  const reecritures = (pareil: (a: unknown, b: unknown) => boolean): number => {
    let surLaFiche: unknown = null;
    let n = 0;
    for (let passage = 0; passage < 10; passage += 1) {
      const calcule = resumeDeLAmbassade(lignee!, L, fiches, {}, '2026-10-02');
      if (!pareil(calcule, surLaFiche)) { n += 1; surLaFiche = allerRetour(calcule); }
    }
    return n;
  };
  dit('par le texte, dix passages font dix reecritures : la boucle', 10, reecritures((a, b) => JSON.stringify(a) === JSON.stringify(b)));
  dit('par le contenu, dix passages font UNE ecriture, la premiere', 1, reecritures(memeContenu));

  const classement = classementDuMois(L, '2026-10-02');
  dit('le classement du mois tient aussi l aller-retour', true, memeContenu(classement, allerRetour(classement)));
}

/* ── 3. Les formules rapides du site ── */
{
  const voulues: FormuleRapide[] = [{ serviceIds: ['sv-a', 'sv-b'], venues: 7 }, { serviceIds: ['sv-c'], venues: 3 }];
  const revenues = allerRetour(voulues);
  dit('une formule revient de la base rangee autrement', true, JSON.stringify(voulues) !== JSON.stringify(revenues));
  dit('... et reste la meme formule', true, memesFormules(revenues, voulues));
  dit('une venue de plus reste un changement', false, memesFormules(revenues, [{ serviceIds: ['sv-a', 'sv-b'], venues: 8 }, { serviceIds: ['sv-c'], venues: 3 }]));
  dit('des gestes dans un autre ordre restent un changement', false, memesFormules(revenues, [{ serviceIds: ['sv-b', 'sv-a'], venues: 7 }, { serviceIds: ['sv-c'], venues: 3 }]));
}

/* ── 4. Plus aucun automatisme ne compare par le texte ── */
{
  const sansCommentaires = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const dossier = 'src/apps/trone/shell';
  const automatismes = readdirSync(dossier).filter((f) => /^use.*\.tsx?$/.test(f));
  dit('les automatismes sont bien la', true, automatismes.length >= 7);
  dit('aucun automatisme ne compare deux contenus par leur texte', [],
    automatismes.filter((f) => /JSON\.stringify\([^)]*\)\s*[!=]==\s*JSON\.stringify\(/.test(sansCommentaires(`${dossier}/${f}`))));
  dit('les formules rapides comparent par le contenu', true, /memeContenu\(a \?\? \[\], b\)/.test(sansCommentaires('src/shared/reservation-express.ts')));
  const synchro = sansCommentaires('src/shared/sync.ts');
  dit('la synchronisation n applique pas une ligne qui porte le meme contenu', true, /if \(i >= 0 && memeContenu\(items\[i\], row\.data\)\) return;/.test(synchro));
  dit('... ni un document qui porte le meme contenu', true, /if \(memeContenu\(row\.data, store\.get\(\)\)\) return;/.test(synchro));
  dit('... et reconnait son propre echo par le contenu', true, /j: contenuCanonique\(r\.data\)/.test(synchro) && /const j = contenuCanonique\(row\.data\);/.test(synchro));
}

console.log(ko === 0 ? '\nLe contenu se compare, l ordre des champs ne compte plus.' : `\n${ko} controle(s) en echec.`);
process.exit(ko === 0 ? 0 : 1);
