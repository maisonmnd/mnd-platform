/* MADAME NAFFI, EPROUVE — `node scripts/verifie-civilite.mjs`.

   2 octobre 2026 : la Maison ecrit « Mme Naffi » dans ses messages (la
   civilite de la fiche, puis le prenom), Madame par defaut, trois civilites.
   Le harnais tient la regle, la copie a l'identique dans chaque fonction
   Edge, et les ecrans qui ecrivent a une cliente. */
import { readFileSync } from 'node:fs';
import { appelDe, civiliteDe, civiliteNotee, civilitesAPoser, estMuette, ficheAvecCivilite, prenomSeul } from '../src/shared/civilite';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* ── 1. La regle ── */
dit('une fiche muette : le prenom seul, jamais Madame suppose (13 octobre 2026)', 'Naffi', appelDe({ name: 'Naffi Morou' }));
dit('une fiche dite Madame', 'Mme Naffi', appelDe({ name: 'Naffi Morou', civilite: 'madame' }));
dit('Mademoiselle', 'Mlle Grace', appelDe({ name: 'Grace Ahouansou', civilite: 'mademoiselle' }));
dit('Monsieur', 'M. Keli', appelDe({ name: 'Keli Ahouansou', civilite: 'monsieur' }));
dit('une fiche marquee au masculin avant ce jour est Monsieur', 'M. Keli', appelDe({ name: 'Keli A', auMasculin: true }));
dit('la civilite posee l emporte sur l ancienne marque', 'Mme Keli', appelDe({ name: 'Keli A', auMasculin: true, civilite: 'madame' }));
dit('sans fiche, le prenom de repli seul', 'Awa', appelDe(null, 'Awa Kossou'));
dit('rien de connu : Madame, Monsieur, jamais un blanc', 'Madame, Monsieur', appelDe(null));
dit('une civilite sans prenom : la civilite seule', 'Monsieur', appelDe({ civilite: 'monsieur' }));
dit('les espaces en trop ne comptent pas', 'Mme Awa', appelDe({ name: '  Awa   Kossou ', civilite: 'madame' }));
dit('une civilite inconnue retombe sur Madame', 'madame', civiliteDe({ civilite: 'docteur' as never }));
dit('le prenom seul', 'Naffi', prenomSeul('Naffi Morou'));
dit('poser Monsieur marque la fiche au masculin (les cartes suivent)', { civilite: 'monsieur', auMasculin: true }, ficheAvecCivilite('monsieur'));
dit('poser Madame retire la marque', { civilite: 'madame', auMasculin: undefined }, ficheAvecCivilite('madame'));

/* 28 octobre 2026 : « dire Mr ou Mme avant le prénom ». Abrégée devant le prénom, entière seule. */
dit('sans prenom, la civilite s ecrit en entier', ['Madame', 'Monsieur', 'Mademoiselle'],
  [appelDe({ civilite: 'madame' }), appelDe({ civilite: 'monsieur' }), appelDe({ civilite: 'mademoiselle' })]);
dit('une fiche muette ne dit toujours rien de suppose', ['Jean-Luc', 'Madame, Monsieur'], [appelDe({ name: 'Jean-Luc KINIFFO' }), appelDe(null)]);

/* La fenetre des civilites a poser (FenetreDesCivilites) : les muettes, un RDV a venir d abord. */
dit('la civilite notee : jamais le Madame des cartes', [undefined, 'monsieur', 'mademoiselle'],
  [civiliteNotee({ name: 'Awa' }), civiliteNotee({ auMasculin: true }), civiliteNotee({ civilite: 'mademoiselle', auMasculin: true })]);
dit('muette : rien de note ; une ancienne marque au masculin ne l est pas', [true, false, false],
  [estMuette({ name: 'Awa' }), estMuette({ auMasculin: true }), estMuette({ civilite: 'madame' })]);
{
  const fiches = [
    { id: 'a', name: 'Awa', phone: '0197000001' },
    { id: 'b', name: 'Bio', phone: '' },
    { id: 'c', name: 'Cica', phone: '0197000003' },
    { id: 'd', name: 'Dede', phone: '0197000004' },
    { id: 'e', name: 'Eli', phone: '0197000005' },
  ];
  const prochainRdv = new Map([['c', '2026-11-02'], ['d', '2026-10-30']]);
  const derniereVenue = new Map([['a', '2026-09-01'], ['e', '2026-10-01'], ['b', '2026-10-20']]);
  dit('le tri : RDV le plus proche, puis la venue la plus recente, puis le nom ; sans numero ecartee', ['d', 'c', 'e', 'a'],
    civilitesAPoser({ fiches, prochainRdv, derniereVenue, avecNumero: true }).map((c) => c.id));
  dit('... toutes : la fiche sans numero revient a sa place', ['d', 'c', 'b', 'e', 'a'],
    civilitesAPoser({ fiches, prochainRdv, derniereVenue, avecNumero: false }).map((c) => c.id));
}

/* ── 2. Les fonctions Edge portent la meme regle, a l'identique ── */
{
  const egalise = (t: string) => t.replace(/\r\n/g, '\n');
  const copie = (f: string): string | null => {
    const t = egalise(readFileSync(`supabase/functions/${f}/index.ts`, 'utf8'));
    const a = t.indexOf('const appelDe = (');
    if (a < 0) return null;
    return t.slice(a, t.indexOf('\n};\n', a) + 3);
  };
  /* 9 octobre 2026 : la reprise du webhook dit « Mme Naffi », et la
     réponse automatique (whatsapp-automate) parle à chaque cliente. */
  /* 19 octobre 2026 : le chat du site appelle la visiteuse « Mme Clarisse ». */
  const FONCTIONS = ['confirmation-rdv', 'rappels-j1', 'avis-google', 'demande-submit', 'whatsapp-webhook', 'whatsapp-automate', 'relances-factures', 'discussion', 'rappels-d-echeance', 'fete-de-couronne'];
  const copies = FONCTIONS.map(copie);
  dit('chaque fonction porte appelDe', [], FONCTIONS.filter((_, i) => !copies[i]));
  dit('... la meme, mot pour mot', 1, new Set(copies).size);
  /* La copie se juge sur des cas, pas sur son texte : on l'execute. */
  // deno-lint-ignore no-explicit-any
  const sansTypes = (copies[0] ?? '').replace(/\(d: [\s\S]*?\): string =>/, '(d, repli) =>');
  // deno-lint-ignore no-explicit-any
  const appelEdge = new Function(`${sansTypes}
return appelDe;`)() as any;
  const cas: [unknown, unknown, string][] = [
    [{ name: 'Naffi Morou' }, undefined, 'Naffi'],
    [{ name: 'Naffi Morou', civilite: 'madame' }, undefined, 'Mme Naffi'],
    [{ name: 'Keli A', auMasculin: true }, undefined, 'M. Keli'],
    [{ name: 'Grace A', civilite: 'mademoiselle' }, undefined, 'Mlle Grace'],
    [null, 'Awa Kossou', 'Awa'],
    [null, undefined, 'Madame, Monsieur'],
    [{ civilite: 'monsieur' }, 'Ola', 'M. Ola'],
  ];
  dit('la copie Edge rend ce que rend le depot', cas.map((c) => c[2]), cas.map(([d, r]) => appelEdge(d, r)));
  for (const f of ['confirmation-rdv', 'rappels-j1', 'avis-google']) {
    const t = readFileSync(`supabase/functions/${f}/index.ts`, 'utf8');
    dit(`${f} ne nomme plus la cliente par son seul premier mot`, false, /const prenom = \([^;]*split\(/.test(t));
  }
}

/* ── 3. Les ecrans du Trone qui ecrivent a une cliente ── */
{
  const lit = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const ECRANS: [string, RegExp][] = [
    ['src/apps/trone/routes/clients/_shared.tsx', /const first = appelDe\(client\);/],
    ['src/apps/trone/routes/pilotage/AFaire.tsx', /const prenom = appelDe\(c\);/],
    ['src/apps/trone/routes/vente/Factures.tsx', /Bonjour \$\{appelOf\(selected\)\}/],
    ['src/shared/gestes-conversation.ts', /const prenom = appelDe\(tete as never\);/],
    ['src/apps/trone/shell/useParrainageVivant.ts', /fiche \? appelDe\(fiche\) : m\.prenomMarraine/],
    ['src/apps/trone/routes/clients/CarteDeMarrainePanneau.tsx', /variables: \[appelDe\(client\), donnees\.code\]/],
    ['src/apps/trone/routes/finances/Creances.tsx', /Bonjour \$\{appelDe\(tete\)\}/],
    /* La réponse automatique (9 octobre 2026) : la fiche qui écrit, sinon la
       civilité qu'elle a choisie, sinon Madame. Depuis la relecture du même
       jour, la civilité choisie vaut aussi sur un numéro qui porte d'autres
       fiches (« Pour moi » : celle qui écrit n'en a pas). */
    ['src/shared/automate-wa.ts', /if \(titulaire\) return appelDe\(\{ name: titulaire\.nom, civilite: titulaire\.civilite, auMasculin: titulaire\.auMasculin \}\);\s*if \(base\.panier\.civilite\) return appelDe\(\{ name: base\.panier\.prenom \?\? '', civilite: base\.panier\.civilite \}\);\s*(?:\/\*[^]*?\*\/\s*)?return '';/],
  ];
  dit('les messages du Trone disent la civilite', [], ECRANS.filter(([f, m]) => !m.test(lit(f))).map(([f]) => f));
  const fiche = lit('src/apps/trone/routes/clients/Customers.tsx');
  dit('la fiche se regle d un clic, et la creation demande la civilite', true,
    /onClick=\{\(\) => patch\(ficheAvecCivilite\(x\.cle\)\)\}/.test(fiche) && /\.\.\.ficheAvecCivilite\(civilite\),/.test(fiche));
}

/* ── 4. La reservation du site (13 octobre 2026) : « on suppose que tout le
   monde est Madame ». La civilite se choisit, rien d'avance, et voyage. ── */
{
  const lit2 = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
  const page = lit2('src/apps/revelateur/ilots/Reserver.tsx');
  const fn = lit2('supabase/functions/demande-submit/index.ts');
  const crochet = lit2('src/apps/trone/shell/useRattacheLesReservations.ts');
  dit('le site : rien de choisi d avance, Madame, Mademoiselle, Monsieur, et l envoi l exige', [true, true, true],
    [/useState<Civilite \| ''>\(''\)/.test(page), /CIVILITES\.map\(\(\{ cle, dit: mot \}\)/.test(page), /if \(!civilite\) \{\n\s*setErreur\(f\.erreurCivilite\);/.test(page)]);
  dit('le site envoie la civilite avec le prenom', true, /prenom, civilite, telephone: numero/.test(page));
  dit('la fonction lit trois valeurs seulement, la garde sur la demande, et l accuse la dit', [true, true, true],
    [fn.includes("const civilite = d.civilite === 'madame' || d.civilite === 'mademoiselle' || d.civilite === 'monsieur' ? String(d.civilite) : '';"),
      fn.includes('    prenom,\n    ...(civilite ? { civilite } : {}),\n'), fn.includes('const prenom = appelDe(o.civilite ? { civilite: o.civilite } : null, o.prenom);')]);
  dit('... et l accuse la recoit', true, fn.includes('apptId, demandeId: id, branchId, prenom, telephone, ...(civilite ? { civilite } : {}),'));
  dit('le Trone pose la civilite choisie sur une fiche muette du meme prenom', true, /civiliteAPoser\(fiche, r\.demande\)/.test(crochet) && /\.\.\.ficheAvecCivilite\(civ\)/.test(crochet));
}

console.log(ko === 0 ? '\nLa Maison dit Mme Naffi.' : `\n${ko} controle(s) en echec.`);
process.exit(ko === 0 ? 0 : 1);
