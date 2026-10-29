import { build } from 'esbuild';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

/* LA FILE D'ATTENTE DURABLE, ÉPROUVÉE — `node scripts/verifie-la-file-d-attente.mjs`.

   4 octobre 2026, maquette « Le Trône hors ligne », temps 1. La promesse :
     - un geste fait sans réseau SURVIT à la fermeture du Trône et part au retour ;
     - quand la même ligne a bougé ailleurs pendant la coupure, le geste le plus
       récent gagne, et l'autre est gardé en conflit, jamais jeté ;
     - un changement venu d'un autre poste pendant qu'un geste attend ne le fait
       plus passer pour envoyé ;
     - un réglage (document) suit la même règle.

   Chaque « séance » est un PROCESSUS : la VRAIE synchronisation tourne sur un
   faux serveur (`faux-supabase.ts`) dont la base, comme le stockage du
   téléphone (`faux-stockage.ts`), survit d'une séance à l'autre. */

const racine = path.resolve(import.meta.dirname, '..');
const travail = mkdtempSync(path.join(tmpdir(), 'verifie-file-'));
const seance = path.join(travail, 'seance.mjs');
let ko = 0;
const dit = (nom, attendu, obtenu) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

try {
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-la-file-d-attente.seance.ts')],
    bundle: true, format: 'esm', platform: 'node', outfile: seance, logLevel: 'error',
    loader: { '.css': 'empty' },
    define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: 'http://faux', VITE_SUPABASE_ANON_KEY: 'faux', BASE_URL: '/trone/' }) },
    plugins: [{
      name: 'faux-supabase',
      setup(b) {
        b.onResolve({ filter: /\/supabase$/ }, (a) => (a.importer.includes(`${path.sep}src${path.sep}`) || a.importer.includes('/src/')
          ? { path: path.join(racine, 'scripts/faux-supabase.ts') } : undefined));
      },
    }],
  });

  let n = 0;
  const nouveauTelephone = () => { const d = path.join(travail, `tel-${++n}`); mkdirSync(d); return d; };
  const lance = (etat, env) => {
    const sortie = execFileSync(process.execPath, [seance], { env: { ...process.env, FAUX_ETAT: etat, ...env }, encoding: 'utf8', timeout: 60_000 });
    const ligne = sortie.split('\n').find((l) => l.startsWith('RESULTAT '));
    if (!ligne) throw new Error(`séance sans résultat :\n${sortie}`);
    return JSON.parse(ligne.slice(9));
  };
  const seanceAvec = (etat, { reseau = true, gestes = [], apres } = {}) =>
    lance(etat, { FAUX_RESEAU: reseau ? '1' : '0', GESTES: JSON.stringify(gestes), ...(apres ? { APRES: String(apres) } : {}) });
  const ailleurs = (etat, id, nom) => lance(etat, { ETAPE: 'ailleurs', ID: id, NOM: nom });

  /* 0. L'arbitre seul. */
  const p = lance(travail, { ETAPE: 'pur' });
  dit('arbitre : le geste plus recent gagne, le plus ancien devient conflit, la suppression recente passe, la ligne neuve se pose',
    { a: 'A-tel', b: 'B', d: 'D-neuf' }, p.items);
  dit('... ce qui part, ce qui sort de la file', [['a', 'c', 'd'], ['b', 'e']], [p.aPousser, p.finis]);
  dit('... le perdant est garde, avec les deux versions', [['b', 'B-tel', 'B']], p.conflits);
  dit('sans heure du serveur, le telephone fait foi', ['B-tel', 0], p.sansHeure);
  dit('un geste deja arrive sort de la file sans rien pousser', [['a'], []], p.deja);
  dit('les gestes entre deux etats : modifie, supprime, neuf', [['x', 'set'], ['z', 'set'], ['y', 'del']], p.gestes);
  dit('apres envoi, ne sortent que les gestes recus tels quels', ['w', 'x'], p.recus);
  dit('en direct : plus recent tient, plus ancien cede, heure inconnue tient', [true, false, true], p.tient);

  /* A. LE GESTE HORS LIGNE SURVIT À LA FERMETURE. */
  const A = nouveauTelephone();
  ailleurs(A, 'a1', 'A'); ailleurs(A, 'c1', 'C');
  const a1 = seanceAvec(A);
  dit('A1 : le telephone s ouvre en ligne et lit le serveur', { a1: 'A', c1: 'C' }, a1.local);
  const a2 = seanceAvec(A, { reseau: false, gestes: [['set', 'a1', 'A2'], ['set', 'b1', 'B'], ['del', 'c1']] });
  dit('A2 : hors ligne, trois gestes attendent dans la file', 3, a2.attente);
  dit('... le serveur n a rien recu', { a1: 'A', c1: 'C' }, a2.serveur);
  /* Le Trône est fermé ici : la séance suivante est un nouveau processus. */
  const a3 = seanceAvec(A);
  dit('A3 : rouvert en ligne, les gestes d hier partent', { a1: 'A2', b1: 'B' }, a3.serveur);
  dit('... le telephone porte la meme chose', { a1: 'A2', b1: 'B' }, a3.local);
  dit('... et la file est vide, sans conflit', [0, 0], [a3.attente, a3.conflits.length]);

  /* B. LE DERNIER GESTE GAGNE : ailleurs, plus tard que nous. */
  const b1 = seanceAvec(A, { reseau: false, gestes: [['set', 'a1', 'Telephone']] });
  dit('B1 : hors ligne, un geste attend', 1, b1.attente);
  await new Promise((r) => setTimeout(r, 30));
  ailleurs(A, 'a1', 'Ailleurs');
  const b2 = seanceAvec(A);
  dit('B2 : l ecriture d ailleurs, plus recente, est gardee', ['Ailleurs', 'Ailleurs'], [b2.serveur.a1, b2.local.a1]);
  dit('... notre geste, plus ancien, est garde en conflit', [['essais', 'a1', 'Telephone', 'Ailleurs']], b2.conflits);
  dit('... et sort de la file', 0, b2.attente);

  /* G. « REPRENDRE MA VERSION » : le conflit de B se reprend, comme un geste
     neuf. Il se reprend TANT QU'IL EST OUVERT : une réécriture de la ligne
     le tranche (6 octobre 2026), d'où sa place juste après B. */
  const g1 = seanceAvec(A, { gestes: [['reprendre']] });
  dit('G : reprendre ma version la renvoie au serveur et ferme le conflit', ['Telephone', 'Telephone', 0, 0], [g1.serveur.a1, g1.local.a1, g1.conflits.length, g1.attente]);

  /* C. LE DERNIER GESTE GAGNE : nous, plus tard qu'ailleurs. */
  ailleurs(A, 'a1', 'Vieux');
  await new Promise((r) => setTimeout(r, 30));
  seanceAvec(A, { reseau: false, gestes: [['set', 'a1', 'Neuf']] });
  const c2 = seanceAvec(A);
  dit('C : notre geste, plus recent qu ailleurs, l emporte', ['Neuf', 'Neuf'], [c2.serveur.a1, c2.local.a1]);
  dit('... sans conflit de plus', 0, c2.conflits.length);


  /* D. LE RÉSEAU REVIENT PENDANT LA SÉANCE (sans fermer). */
  const D = nouveauTelephone();
  ailleurs(D, 'd1', 'D');
  seanceAvec(D);
  const d2 = seanceAvec(D, { reseau: false, gestes: [['set', 'd1', 'D-hors-ligne'], ['pause', '400'], ['online']] });
  dit('D : le reseau revient en cours de seance, le geste part', ['D-hors-ligne', 0], [d2.serveur.d1, d2.attente]);

  /* E. LA COURSE : un autre poste écrit pendant que notre geste attend son
     envoi. Le repère prenait toute la table : notre geste passait pour envoyé. */
  const E = nouveauTelephone();
  ailleurs(E, 'x1', 'X'); ailleurs(E, 'y1', 'Y');
  seanceAvec(E);
  const e2 = seanceAvec(E, { gestes: [['set', 'x1', 'X-local'], ['ailleurs', 'y1', 'Y-ailleurs']] });
  dit('E : notre geste part malgre l ecriture d un autre poste juste apres', { x1: 'X-local', y1: 'Y-ailleurs' }, Object.fromEntries(Object.entries(e2.serveur).sort()));
  const trie = (o) => Object.fromEntries(Object.entries(o).sort());
  dit('... et le telephone voit les deux', { x1: 'X-local', y1: 'Y-ailleurs' }, trie(e2.local));

  /* F. UN RÉGLAGE CHANGÉ HORS LIGNE. */
  const F = nouveauTelephone();
  seanceAvec(F, { gestes: [['doc', '1']] });
  const f2 = seanceAvec(F, { reseau: false, gestes: [['doc', '2']] });
  dit('F1 : hors ligne, le reglage attend', [2, 1, 1], [f2.doc, f2.docServeur, f2.attente]);
  const f3 = seanceAvec(F);
  dit('F2 : rouvert en ligne, le reglage part', [2, 2, 0], [f3.doc, f3.docServeur, f3.attente]);

  /* I. UNE VIEILLE COPIE NE GAGNE PAS SANS GESTE — 4 octobre 2026, les codes
     du coffre et des caisses refusés. Le téléphone garde le réglage à 1 ; un
     autre poste le passe à 5 ; le téléphone se rouvre, et son magasin est
     prévenu AVANT l'hydratation sans que personne n'ait rien changé. Ce n'est
     pas un geste : le serveur doit garder 5, et le téléphone le recevoir. */
  const G = nouveauTelephone();
  seanceAvec(G, { gestes: [['doc', '1']] });
  lance(G, { ETAPE: 'ailleurs-doc', V: '5' });
  const g2 = lance(G, { FAUX_RESEAU: '1', AVANT: '0', GESTES: JSON.stringify([['touche']]) });
  dit('I : une copie perimee, prevenue sans geste, ne remplace pas le serveur', [5, 5, 0], [g2.docServeur, g2.doc, g2.conflits.length]);

  /* J. LA FRAPPE DANS UN RÉGLAGE — 17 octobre 2026, « fix the conflict » :
     « MAISON » contre « MAISON_ », deux lettres de SA frappe du nom du Wi-Fi
     (16 octobre, 15 h 09), prises pour une dispute avec un autre poste. Le
     vrai serveur rend le document avec ses champs rangés autrement (jsonb),
     son écho arrive en retard, et son horloge peut avancer sur celle du
     poste : notre propre écho passait pour plus récent que la lettre en
     attente. Un écho de NOTRE envoi n'est jamais un conflit, et le champ ne
     recule pas sous les doigts. */
  const J = nouveauTelephone();
  seanceAvec(J);
  const j2 = lance(J, {
    FAUX_RESEAU: '1', FAUX_JSONB: '1', FAUX_ECHO_MS: '1000', FAUX_LATENCE_MS: '300', FAUX_AVANCE_MS: '0', JETON_MS: '120',
    GESTES: JSON.stringify([['frappe', 'MAISON_MND', '400']]), APRES: '5000',
  });
  dit('J : la frappe d un reglage arrive entiere, sans conflit, sans recul', ['MAISON_MND', 'MAISON_MND', 0, 0, 0],
    [j2.wifi, j2.wifiServeur, j2.conflitsNotes, j2.reculs, j2.attente]);

  /* M. LA RELECTURE PLUS VIEILLE QUE LA DERNIÈRE LETTRE : elle a lu le
     serveur avant que la lettre y arrive, et répond après. Elle rapporte
     NOTRE envoi d'avant : la case ne recule pas. */
  const M = nouveauTelephone();
  seanceAvec(M);
  const m2 = lance(M, {
    FAUX_RESEAU: '1', FAUX_JSONB: '1', FAUX_ECHO_MS: '1000', FAUX_LATENCE_MS: '300', FAUX_LECTURE_TOT: '1', JETON_MS: '400',
    GESTES: JSON.stringify([['frappe', 'MAISON_MND', '400']]), APRES: '5000',
  });
  dit('M : une relecture plus vieille que la frappe ne fait pas reculer la case', ['MAISON_MND', 'MAISON_MND', 0, 0, 0],
    [m2.wifi, m2.wifiServeur, m2.conflitsNotes, m2.reculs, m2.attente]);

  /* L. UN RÉGLAGE CHANGÉ SUR UN AUTRE POSTE ARRIVE EN DIRECT (17 octobre
     2026 : le canal le donnait, la distribution le perdait). */
  const L = nouveauTelephone();
  seanceAvec(L);
  const l2 = seanceAvec(L, { gestes: [['docailleurs', '7']], apres: 800 });
  dit('L : un reglage change ailleurs arrive en direct, sans relecture', [7, 0], [l2.doc, l2.conflits.length]);

  /* K. LE CONFLIT DU WI-FI, DÉJÀ TRANCHÉ, NE SE DEMANDE PLUS. */
  const k = (wifi, lecteur) => lance(nouveauTelephone(), { ETAPE: 'tranche-doc', WIFI: wifi, LECTEUR: lecteur }).montres;
  dit('K : un reglage retape depuis (MAISON_MND) : le conflit se tait ; la version gardee encore la : il reste',
    [0, 0, 1, 1], [k('MAISON_MND', '1'), k('MAISON_MND', '0'), k('MAISON', '1'), k('MAISON', '0')]);

  /* H. UN REFUS DE DROIT : le geste ne compte pas « en attente » pour toujours. */
  const H = nouveauTelephone();
  ailleurs(H, 'h1', 'H');
  seanceAvec(H);
  const h2 = lance(H, { FAUX_RESEAU: '1', FAUX_REFUS: 'essais', GESTES: JSON.stringify([['set', 'h1', 'H-interdit']]) });
  dit('H : refuse par les droits, le geste sort de la file', [0, 'H'], [h2.attente, h2.serveur.h1]);

  /* ── TEMPS 3 : LES ENVOIS QUI ATTENDENT LE RÉSEAU ── */
  const W = nouveauTelephone();
  const w1 = seanceAvec(W, { reseau: false, gestes: [['whatsapp', 'Un'], ['whatsapp', 'Deux']] });
  dit('I : hors ligne, les WhatsApp sont gardes et l ecran le sait', [2, [], true], [w1.envois, w1.recus, w1.dernier?.enAttente === true]);
  const w2 = seanceAvec(W, { apres: 7500 });
  dit('II : rouvert en ligne, ils partent seuls, dans l ordre', [0, ['Un', 'Deux']], [w2.envois, w2.recus]);
  const w3 = seanceAvec(W, { gestes: [['whatsapp', 'Direct']] });
  dit('III : en ligne, il part tout de suite, et une seule fois', [0, ['Un', 'Deux', 'Direct'], true], [w3.envois, w3.recus, w3.dernier?.ok === true && !w3.dernier?.enAttente]);
  const w4 = lance(W, { FAUX_RESEAU: '1', FAUX_REFUS_FONCTION: 'whatsapp-envoi', GESTES: JSON.stringify([['whatsapp', 'Refuse']]) });
  dit('IV : un refus du serveur ne se garde JAMAIS (pas de doublon), et se dit', [0, false], [w4.envois, w4.dernier?.ok]);
  seanceAvec(W, { reseau: false, gestes: [['whatsapp', 'Plus tard']] });
  /* Le motif est celui de la FONCTION, jamais « Edge Function returned a
     non-2xx status code » (29 octobre 2026, le refus du 5 octobre). */
  const w6 = lance(W, { FAUX_RESEAU: '1', FAUX_REFUS_FONCTION: 'whatsapp-envoi', FAUX_MOTIF: 'Hors de la fenetre de 24 h', APRES: '7500' });
  dit('V : garde puis refuse au retour : sort de la file, note comme refuse, avec le motif de la fonction',
    [0, 1, ['Un', 'Deux', 'Direct'], ['Hors de la fenetre de 24 h']], [w6.envois, w6.refus, w6.recus, w6.refusDits]);
} finally {
  rmSync(travail, { recursive: true, force: true });
}

console.log(ko === 0 ? '\nLe telephone fait foi, et rien ne se perd.' : `\n${ko} controle(s) en echec.`);
process.exit(ko === 0 ? 0 : 1);
