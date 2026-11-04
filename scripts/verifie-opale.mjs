import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* OPALE, ÉPROUVÉE : `node scripts/verifie-opale.mjs` (et `--prouve` pour
   planter les pannes une à une).

   4 novembre 2026. Le harnais (verifie-opale.harnais.ts) importe la VRAIE
   fonction whatsapp-automate : esbuild remplace ses imports `npm:` par une
   base et un Claude simulés. Chaque panne se plante EN MÉMOIRE, au
   chargement du fichier ou à sa lecture (`__PANNE__`) : l'arbre n'est
   jamais touché, l'empreinte de chaque fichier est comparée avant et
   après. Une panne dont le texte ne se trouve pas exactement une fois fait
   échouer la preuve : elle ne prouverait rien. */

const racine = path.resolve(import.meta.dirname, '..');
const HARNAIS = path.join(racine, 'scripts/verifie-opale.harnais.ts');
const AU = 'supabase/functions/whatsapp-automate/index.ts';
const WH = 'supabase/functions/whatsapp-webhook/index.ts';
const OP = 'src/shared/opale-pur.ts';

/** { nom, fichier, avant, apres } */
const PANNES = [
  { nom: 'l aiguillage oublie le reglage', fichier: AU, avant: "if (reglageDOpale(docs.get(CLE_D_OPALE)).qui === 'opale') {", apres: 'if (true) {' },
  { nom: 'Opale parle quand l equipe a la main', fichier: AU, avant: "if (pauseActive(main, ms)) { dis('opale · l equipe a la main'); return { pris: false }; }", apres: '' },
  { nom: 'Opale parle apres avoir passe la main', fichier: AU, avant: "if (fil && etapeCourante(fil, main, ms, reglage.pauseHeures) === 'main' && !o.reprise) { dis('opale · la main est passee, pas encore rendue'); return { pris: false }; }", apres: '' },
  { nom: 'la trace n est pas signee Opale', fichier: AU, avant: 'm, rendu, parQui: OPALE, ', apres: 'm, rendu, ' },
  { nom: 'les juges ne lisent pas son message', fichier: AU, avant: 'const fautes = fautesDOpale(texte, { montantsPermis: permis, questionFranche });', apres: 'const fautes: string[] = [];' },
  { nom: 'Claude injoignable laisse la cliente sans reponse', fichier: AU, avant: "dis('opale · claude injoignable', { motif: String((e as Error)?.message ?? e).slice(0, 120) });\n      secours = true;", apres: 'throw e;' },
  { nom: 'le plafond du numero ne tient pas', fichier: AU, avant: 'if ((dits ?? 0) >= MESSAGES_D_OPALE_PAR_JOUR) {', apres: 'if (false) {' },
  { nom: 'un prestataire est servi', fichier: AU, avant: "  if (o.tiroir !== 'equipe') return false;\n  const k = o.cle(o.numero);", apres: "  if (o.tiroir !== 'equipe') return true;\n  const k = o.cle(o.numero);" },
  { nom: 'confirmer pose sans son oui', fichier: AU, avant: '      if (!permisDe.ok) return permisDe.pourquoi;', apres: '' },
  { nom: 'la confirmation dite ne ferme pas sa ligne', fichier: AU, avant: "  if (issue.posee) await ditLaConfirmation(sb, issue.posee, premier ?? { detail: 'la confirmation n est pas partie dans la conversation' });", apres: '' },
  { nom: 'un merci recoit quand meme un message', fichier: AU, avant: "  if (!issue.silence) sortants.push({ forme: 'texte',", apres: "  sortants.push({ forme: 'texte'," },
  { nom: 'le plan part a une habituee', fichier: AU, avant: 'if (connaitLeLieu && !demande) return', apres: 'if (false && !demande) return' },
  { nom: 'le total du recapitulatif n est pas permis', fichier: AU, avant: 'if (complet && total > 0 && ids.length > 1) permis.add(total);', apres: '' },
  { nom: 'le contexte dit le numero', fichier: AU, avant: "l.push(`- fiche [${f.id}] : ${traits.join(' ; ')}.`);", apres: "l.push(`- fiche [${f.id}] : ${traits.join(' ; ')}. Son numero : 90000001.`);" },
  { nom: 'le moment du matin se lit a l envers', fichier: OP, avant: "if (s.moment === 'matin') return m < 12 * 60;", apres: "if (s.moment === 'matin') return m >= 12 * 60;" },
  { nom: 'confirmer permis avant la lecture du recapitulatif', fichier: OP, avant: '  if (Number.isFinite(premier) && premier < le) return', apres: '  if (false) return' },
  { nom: 'le webhook coupe le tour a 30 s', fichier: WH, avant: 'const AUTOMATE_EN_FOND_MS = 120_000;', apres: 'const AUTOMATE_EN_FOND_MS = 30_000;' },
  { nom: 'les places s arretent a quatorze jours', fichier: AU, avant: 'const horizonPour = (jour?: string): number => Math.min(90, Math.max(reglage.horizonJours, 30, jour ? joursJusqua(jour) + 7 : 0));', apres: 'const horizonPour = (_jour?: string): number => reglage.horizonJours;' },
  { nom: 'la reprise prend son mot de relais pour une reponse', fichier: AU, avant: "&& d.etape !== 'main') break;", apres: ') break;' },
  { nom: 'la consigne laisse dire deplace', fichier: OP, avant: ' : ne dis jamais qu’il a été déplacé.', apres: '.' },
  { nom: 'la consigne oublie la Maison MND', fichier: OP, avant: 'Quand tu nommes le lieu, écris « la Maison MND » en entier : « Nous vous attendons à la Maison MND ». ', apres: '' },
  { nom: 'Opale annonce l offre du moment', fichier: AU, avant: '    paiements, offres: [], catalogue,', apres: "    paiements, offres: offresDOpale(docs.get('mnd_offers'), aujourdhui), catalogue," },
  { nom: 'la consigne laisse parler des remises', fichier: OP, avant: 'Ne parle d’aucune remise, d’aucun code ni d’aucune offre : la Maison MND les applique elle-même, quand ils valent pour elle.', apres: 'L’offre du jour se dit telle quelle.' },
  { nom: 'la copie du bloc derive', fichier: AU, avant: 'export const MESSAGES_D_OPALE_PAR_JOUR = 40;', apres: 'export const MESSAGES_D_OPALE_PAR_JOUR = 400;' },
];

const md5 = (rel) => createHash('md5').update(readFileSync(path.join(racine, rel))).digest('hex');

const faux = (panne) => ({
  name: 'faux-du-banc',
  setup(b) {
    b.onResolve({ filter: /^npm:/ }, (a) => ({ path: a.path, namespace: 'faux' }));
    b.onLoad({ filter: /.*/, namespace: 'faux' }, (a) => ({
      loader: 'js',
      contents: a.path.startsWith('npm:@supabase/supabase-js')
        ? 'export const createClient = (...a) => globalThis.__faux.client(...a);'
        : a.path.startsWith('npm:@anthropic-ai/sdk')
          ? 'export default class Anthropic { constructor(o) { this.o = o; this.messages = { create: (c) => globalThis.__faux.claude(c) }; } }'
          : 'export default {};',
    }));
    b.onLoad({ filter: /\.(ts|tsx)$/ }, (a) => {
      const rel = path.relative(racine, a.path).split(path.sep).join('/');
      if (!panne || panne.fichier !== rel) return undefined;
      const src = readFileSync(a.path, 'utf8').replace(/\r\n/g, '\n');
      if (src.split(panne.avant).length !== 2) throw new Error(`PANNE INTROUVABLE : ${panne.nom}`);
      return { contents: src.replace(panne.avant, panne.apres), loader: 'ts', resolveDir: path.dirname(a.path) };
    });
  },
});

async function tourne(panne) {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-opale-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    await build({
      entryPoints: [HARNAIS], bundle: true, format: 'esm', platform: 'node', target: 'es2022',
      outfile: sortie, logLevel: 'silent', plugins: [faux(panne)],
      define: { __PANNE__: JSON.stringify(panne ?? null) },
    });
    const r = spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
    return { code: r.status, sortie: `${r.stdout ?? ''}${r.stderr ?? ''}` };
  } catch (e) {
    return { code: 1, sortie: String(e?.message ?? e) };
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const net = await tourne(null);
process.stdout.write(net.sortie);
if (net.code !== 0) process.exit(1);
if (process.argv.includes('--prouve')) {
  let muettes = 0;
  for (const p of PANNES) {
    const texte = readFileSync(path.join(racine, p.fichier), 'utf8').replace(/\r\n/g, '\n');
    const fois = texte.split(p.avant).length - 1;
    const avant = md5(p.fichier);
    let verdict;
    if (fois !== 1) verdict = `INTROUVABLE (${fois} fois)`;
    else verdict = (await tourne(p)).code !== 0 ? 'CRIE ' : 'MUETTE';
    if (md5(p.fichier) !== avant) verdict = `LE FICHIER A CHANGE (${verdict})`;
    if (verdict !== 'CRIE ') muettes++;
    console.log(`${verdict} ${p.nom}`);
  }
  if (muettes) { console.log(`\n${muettes} panne(s) muette(s) ou introuvable(s) : le banc ne voit pas tout.`); process.exit(1); }
  console.log(`\nLes ${PANNES.length} pannes crient.`);
}
