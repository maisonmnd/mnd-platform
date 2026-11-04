import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LE MESSAGE DU FOYER, ÉPROUVÉ (4 novembre 2026).
   `node scripts/verifie-le-message-du-foyer.mjs` lance le harnais ;
   `--prouve` le relance sur chaque panne ci-dessous, et chaque panne doit le
   faire crier. Les pannes vivent dans la mémoire du bundle (un greffon
   d'esbuild remplace le texte lu), jamais dans le dépôt : l'empreinte de
   chaque fichier est comparée avant et après. Une panne dont le texte ne se
   trouve pas exactement une fois dans chacun de ses fichiers fait échouer la
   preuve : elle ne prouverait rien. Une panne qui vise la règle la casse
   dans l'original ET dans ses trois copies, comme une règle fausse au dépôt
   le serait partout. `--voir <n>` : la sortie du banc sous la panne n. */

const racine = path.resolve(import.meta.dirname, '..');
const HARNAIS = path.join(racine, 'scripts/verifie-le-message-du-foyer.harnais.ts');
const PUR = 'src/shared/message-du-foyer-pur.ts';
const PORTE = 'src/shared/porte-des-modeles-pur.ts';
const CR = 'supabase/functions/confirmation-rdv/index.ts';
const RJ = 'supabase/functions/rappels-j1/index.ts';
const EP = 'supabase/functions/envois-partent/index.ts';
const PARTOUT = [PUR, CR, RJ, EP];

/** { nom, mutations: [{ fichiers, avant, apres }] } */
const PANNES = [
  { nom: 'deux messages au meme numero : le rappel part tete par tete', mutations: [{ fichiers: [RJ],
    avant: 'for (const foyer of foyersAPrevenir(aRappeler)) {', apres: 'for (const foyer of aRappeler.map((t) => ({ cle: t.id, porteur: t, tetes: [t] }))) {' }] },
  { nom: 'deux messages au meme numero : la seconde tete confirmee a part', mutations: [{ fichiers: [CR],
    avant: 'for (const f of foyersWa) for (const t of f.tetes.slice(1)) deja.add(', apres: 'for (const f of [] as typeof foyersWa) for (const t of f.tetes.slice(1)) deja.add(' }] },
  { nom: 'deux messages au meme numero : le foyer ne se forme jamais', mutations: [{ fichiers: PARTOUT,
    avant: "return t.foyerId && t.date && numero ? `foyer|${t.foyerId}|${t.date.slice(0, 10)}|${numero}` : `seule|${t.id}`;", apres: 'return `seule|${t.id}`;' }] },
  { nom: 'un prenom oublie', mutations: [{ fichiers: PARTOUT,
    avant: "return `${p.slice(0, -1).join(', ')} et ${p[p.length - 1]}`;", apres: "return p.slice(0, -1).join(', ');" }] },
  { nom: 'une fiche sur deux nommee', mutations: [{ fichiers: PARTOUT,
    avant: 'return fiches.length <= 1 ? appelSeule(f.porteur) : prenomsDits(fiches.map(prenomDe));', apres: 'return appelSeule(f.porteur);' }] },
  { nom: 'un nom de famille dit', mutations: [{ fichiers: PARTOUT,
    avant: "export const prenomDeLaTete = (nom: unknown): string => String(nom ?? '').trim().split(/\\s+/)[0] ?? '';", apres: "export const prenomDeLaTete = (nom: unknown): string => String(nom ?? '').trim();" }] },
  { nom: 'un foyer de deux numeros fondu en un', mutations: [{ fichiers: PARTOUT,
    avant: '`foyer|${t.foyerId}|${t.date.slice(0, 10)}|${numero}`', apres: '`foyer|${t.foyerId}|${t.date.slice(0, 10)}`' }] },
  { nom: 'deux enfants hors d un foyer reunis', mutations: [{ fichiers: PARTOUT,
    avant: 'return t.foyerId && t.date && numero ?', apres: 'return t.date && numero ?' }] },
  { nom: 'un rendez-vous annule encore nomme', mutations: [{ fichiers: PARTOUT,
    avant: "if (!t || !t.id || t.status === 'annulé' || vus.has(t.id)) continue;", apres: 'if (!t || !t.id || vus.has(t.id)) continue;' }] },
  { nom: 'le facteur fait partir un foyer dont une tete est annulee', mutations: [{ fichiers: [EP],
    avant: 'if (motifDuFoyer) {', apres: 'if (motifDuFoyer && false) {' }] },
  { nom: 'le foyer relu oublie l annulation', mutations: [{ fichiers: PARTOUT,
    avant: "    if (r.status === 'annulé') return 'un rendez-vous du foyer a été annulé : le message se refait sans lui';\n", apres: '' }] },
  { nom: 'la porte laisse passer le second', mutations: [
    { fichiers: [PORTE, EP], avant: "  if (tetes.length > 0 && tetes.every((t) => couvertes.has(t))) return 'déjà parti : chaque rendez-vous de ce foyer est nommé au journal depuis moins de 20 h';\n", apres: '' },
    { fichiers: [PORTE, EP], avant: 'if (unParTete) for (const c of fichesNommees(m)) vues.add(c);', apres: 'if (unParTete && m.clientId) vues.add(String(m.clientId));' },
  ] },
  { nom: 'la porte ne lit pas les lignes du foyer', mutations: [{ fichiers: [EP],
    avant: "const foyer = String(l.foyerId || (l.apptId ? rdv?.foyerId ?? '' : '') || '');", apres: "const foyer = String(l.foyerId || '');" }] },
  { nom: 'la confirmation du foyer ne tait pas le rappel de chaque tete', mutations: [{ fichiers: [PORTE],
    avant: 'for (const id of tetesNommees(o)) confirmes.add(id);', apres: 'if (o.apptId) confirmes.add(String(o.apptId));' }] },
  { nom: 'le retenu par Opale redepose par confirmation-rdv', mutations: [{ fichiers: [CR],
    avant: ".filter((r) => !SE_RETENTE.has((r.data as { statut?: string } | null)?.statut ?? '') || retenuParOpale(r.data as { detail?: unknown } | null))",
    apres: ".filter((r) => !SE_RETENTE.has((r.data as { statut?: string } | null)?.statut ?? ''))" }] },
  { nom: 'le retenu par Opale redepose pour les autres tetes du foyer', mutations: [{ fichiers: [RJ],
    avant: "const verrouille = (d: { statut?: string; detail?: unknown }): boolean => !SE_RETENTE.has(d.statut ?? '') || retenuParOpale(d);",
    apres: "const verrouille = (d: { statut?: string; detail?: unknown }): boolean => !SE_RETENTE.has(d.statut ?? '');" }] },
  { nom: 'une tete nommee par le rappel du foyer ne compte pas comme rappelee', mutations: [{ fichiers: [RJ],
    avant: 'for (const id of tetesCouvertes(lignesDuJour, { type: \'rappel-j1\', canal, verrouille })) deja.add(`env-${id}-${canal}`);', apres: '' }] },
  { nom: 'une tete nommee par la confirmation du foyer ne compte pas comme confirmee', mutations: [{ fichiers: [CR],
    avant: 'for (const id of couvertes) deja.add(`conf-${id}-whatsapp`);', apres: '' }] },
  { nom: 'le fil ne dit pas les fiches du foyer', mutations: [{ fichiers: [EP],
    avant: '...(fichesNommees(l.data).length > 1 ? { clientIds: fichesNommees(l.data) } : {}),', apres: '' }] },
  { nom: 'rappels-j1 ne lit pas les fiches du foyer au fil', mutations: [{ fichiers: [RJ],
    avant: '...fichesNommees({ clientIds: r.data?.clientIds }).map((c) => `${cleDuNumero(r.data?.numero)}|tete|${c}`),', apres: '' }] },
  { nom: 'la ligne du foyer ne dit pas ses tetes', mutations: [{ fichiers: PARTOUT,
    avant: '    apptIds: f.tetes.map((t) => t.id),\n', apres: '' }] },
];

const CIBLES = /(message-du-foyer-pur|porte-des-modeles-pur)\.ts$|supabase[\\/]functions[\\/](confirmation-rdv|rappels-j1|envois-partent)[\\/]index\.ts$/;

const greffon = (panne) => ({
  name: 'faux-et-pannes',
  setup(b) {
    b.onResolve({ filter: /^npm:/ }, (a) => ({ path: a.path, namespace: 'faux' }));
    b.onLoad({ filter: /.*/, namespace: 'faux' }, () => ({ loader: 'js', contents: 'export const createClient = (...a) => globalThis.__faux.client(...a);' }));
    b.onLoad({ filter: CIBLES }, (a) => {
      const rel = path.relative(racine, a.path).replace(/\\/g, '/');
      let src = readFileSync(a.path, 'utf8').replace(/\r\n/g, '\n');
      for (const m of panne?.mutations ?? []) {
        if (!m.fichiers.includes(rel)) continue;
        if (src.split(m.avant).length !== 2) throw new Error(`PANNE INTROUVABLE : ${panne.nom} dans ${rel}`);
        src = src.replace(m.avant, m.apres);
      }
      return { contents: src, loader: 'ts' };
    });
  },
});

async function tourne(panne) {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-le-message-du-foyer-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    /* Chaque fichier visé doit porter le texte de la panne : vérifié avant le bundle. */
    for (const m of panne?.mutations ?? []) {
      for (const f of m.fichiers) {
        const t = readFileSync(path.join(racine, f), 'utf8').replace(/\r\n/g, '\n');
        if (t.split(m.avant).length !== 2) return { code: 3, sortie: `PANNE INTROUVABLE : ${panne.nom} dans ${f}\n` };
      }
    }
    await build({
      entryPoints: [HARNAIS], bundle: true, format: 'esm', platform: 'node', target: 'es2022',
      outfile: sortie, logLevel: 'silent', plugins: [greffon(panne)],
    });
    const r = spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
    return { code: r.status, sortie: `${r.stdout ?? ''}${r.stderr ?? ''}` };
  } catch (e) {
    return { code: 3, sortie: String(e?.message ?? e) };
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const md5 = (rel) => createHash('md5').update(readFileSync(path.join(racine, rel))).digest('hex');
const empreintes = Object.fromEntries([HARNAIS, PUR, PORTE, CR, RJ, EP].map((f) => [f, md5(path.relative(racine, path.resolve(racine, f)))]));

const voir = process.argv.indexOf('--voir');
if (voir > 0) {
  const r = await tourne(PANNES[Number(process.argv[voir + 1]) - 1] ?? null);
  process.stdout.write(r.sortie);
  process.exit(0);
}

const juste = await tourne(null);
process.stdout.write(juste.sortie);
if (juste.code !== 0) process.exitCode = 1;

if (process.argv.includes('--prouve')) {
  let criees = 0;
  for (const panne of PANNES) {
    const r = await tourne(panne);
    const introuvable = /PANNE INTROUVABLE/.test(r.sortie);
    const criee = !introuvable && r.code !== 0 && /ECHEC/.test(r.sortie);
    if (criee) criees++;
    else process.exitCode = 1;
    console.log(`${criee ? 'CRIEE  ' : introuvable ? 'ABSENTE' : 'MUETTE '} ${panne.nom}${criee ? ` (${(r.sortie.match(/^ECHEC.*$/m) ?? [''])[0].slice(6, 80)})` : introuvable ? ` : ${r.sortie.trim().slice(0, 140)}` : ''}`);
  }
  console.log(`\n${criees} pannes criees sur ${PANNES.length}.`);
  const touches = Object.entries(empreintes).filter(([f, h]) => md5(path.relative(racine, path.resolve(racine, f))) !== h).map(([f]) => f);
  if (touches.length) { console.log(`L ARBRE A BOUGE : ${touches.join(', ')}`); process.exitCode = 1; }
  else console.log('Aucun fichier du depot n a bouge.');
}
