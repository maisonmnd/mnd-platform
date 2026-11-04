import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LA PORTE DES MODELES, EPROUVEE (4 novembre 2026).
   `node scripts/verifie-la-porte-des-modeles.mjs` lance le harnais ;
   `--prouve` le relance sur chaque panne ci-dessous, et chaque panne doit le
   faire crier. Les pannes vivent dans la memoire du bundle (un greffon
   d'esbuild remplace le texte lu du module pur) et dans la lecture des
   sources par le harnais (`__PANNE__`, pour le facteur et rappels-j1), jamais
   dans le depot : l'empreinte de chaque fichier est comparee avant et apres.
   Une panne dont le texte ne se trouve pas exactement une fois fait echouer
   la preuve : elle ne prouverait rien. */

const racine = path.resolve(import.meta.dirname, '..');
const P = 'src/shared/porte-des-modeles-pur.ts';
const EP = 'supabase/functions/envois-partent/index.ts';
const RJ = 'supabase/functions/rappels-j1/index.ts';

const PANNES = [
  /* (a) qui envoie */
  { nom: 'une campagne jugee en entier', fichier: P,
    avant: "  if (porte === 'jamais-deux-fois') return { verdict: 'passe' };\n", apres: '' },
  { nom: 'une main qui dit maintenant jugee', fichier: P,
    avant: "  if (l.parLaMain === true) return 'aucune';\n", apres: '' },
  { nom: 'un envoi manuel juge', fichier: P,
    avant: "  if (e || PAR_QUI_AUTOMATIQUES.includes(parQui)) return 'toutes';\n  return 'aucune';", apres: "  return 'toutes';" },
  /* (b) jamais deux fois */
  { nom: 'le numero compare tel quel', fichier: P,
    avant: '!modeles.includes(m.modele) || cleDuNumeroWa(m.numero) !== numero) continue;', apres: '!modeles.includes(m.modele) || m.numero !== l.colis?.numero) continue;' },
  { nom: 'un non remis compte comme parti', fichier: P,
    avant: "if (!m || m.sens !== 'sortant' || m.etat === 'non-remis' || !recent(m.quand)) continue;", apres: "if (!m || m.sens !== 'sortant' || !recent(m.quand)) continue;" },
  { nom: 'la fenetre de vingt heures retrecit a deux', fichier: P,
    avant: 'export const JAMAIS_DEUX_FOIS_MS = 20 * 3_600_000;', apres: 'export const JAMAIS_DEUX_FOIS_MS = 2 * 3_600_000;' },
  { nom: 'la fenetre de vingt heures s etend a deux jours', fichier: P,
    avant: 'export const JAMAIS_DEUX_FOIS_MS = 20 * 3_600_000;', apres: 'export const JAMAIS_DEUX_FOIS_MS = 48 * 3_600_000;' },
  { nom: 'une seule tete par jour oubliee', fichier: P,
    avant: 'const memeTete = unParTete && nommees.length > 0 && nommees.every((c) => vues.has(c));', apres: 'const memeTete = false;' },
  { nom: 'deux enfants confondus', fichier: P,
    avant: 'const memeTete = unParTete && nommees.length > 0 && nommees.every((c) => vues.has(c));', apres: 'const memeTete = unParTete && vues.size > 0;' },
  /* Un foyer, un message (4 novembre 2026) */
  { nom: 'le foyer oublie au fil', fichier: P,
    avant: 'if (unParTete) for (const c of fichesNommees(m)) vues.add(c);', apres: 'if (unParTete && m.clientId) vues.add(String(m.clientId));' },
  { nom: 'le foyer oublie au journal', fichier: P,
    avant: 'if (tetes.length > 0 && entreeDe(o)?.famille === famille?.famille) for (const t of tetesNommees(o)) couvertes.add(t);', apres: '' },
  { nom: 'le foyer couvre une tete qu il ne nommait pas', fichier: P,
    avant: 'if (tetes.length > 0 && tetes.every((t) => couvertes.has(t)))', apres: 'if (tetes.length > 0 && couvertes.size > 0)' },
  { nom: 'le texte compare avec sa civilite', fichier: P,
    avant: ".replace(/(^|[\\s,;:(«\"'])(?:M\\.|Mme|Mlle|Monsieur|Madame|Mademoiselle)(?= )\\s*/g, '$1')", apres: ".replace(/^$/g, '')" },
  { nom: 'le journal ne compte que les envoyes', fichier: P,
    avant: "if (o.statut !== 'envoyé' && o.statut !== 'à-la-main') continue;", apres: "if (o.statut !== 'envoyé') continue;" },
  { nom: 'le journal compte un echec', fichier: P,
    avant: "if (o.statut !== 'envoyé' && o.statut !== 'à-la-main') continue;", apres: '' },
  { nom: 'le repli de la confirmation oublie', fichier: P,
    avant: 'const modeles = [l.colis?.modele, l.colis?.repli?.modele].filter((m): m is string => !!m);\n  const textes', apres: 'const modeles = [l.colis?.modele].filter((m): m is string => !!m);\n  const textes' },
  /* (c) pas de rappel a qui vient de confirmer */
  { nom: 'oui je viens ignore', fichier: P,
    avant: "if (l.apptId && typeof marque === 'string' && marque.trim()) return 'elle a déjà confirmé sa venue';", apres: '' },
  { nom: 'la confirmation recente oubliee', fichier: P,
    avant: 'ctx.maintenantMs - t < CONFIRMATION_RECENTE_MS', apres: 'ctx.maintenantMs - t < 60_000' },
  { nom: 'elle a ecrit, le rappel part quand meme', fichier: P,
    avant: "if (Number.isFinite(t) && t > depot) return 'elle a écrit depuis le dépôt : la conversation est ouverte';", apres: '' },
  { nom: 'une demande d avis traitee en rappel', fichier: P,
    avant: '  if (!entreeDe(l)?.rappel) return null;\n', apres: '' },
  /* (d) le rendez-vous */
  { nom: 'un rendez-vous honore garde son rappel', fichier: P,
    avant: "  if (r.status === 'honoré') return 'le rendez-vous est déjà honoré';\n", apres: '' },
  { nom: 'un deplacement apres le depot ignore', fichier: P,
    avant: "deplace > depot) return 'le rendez-vous a été déplacé depuis le dépôt';", apres: "deplace > depot && false) return 'le rendez-vous a été déplacé depuis le dépôt';" },
  { nom: 'la confirmation recollee retenue', fichier: P,
    avant: "if (e?.famille !== 'confirmation' && Number.isFinite(deplace)", apres: 'if (Number.isFinite(deplace)' },
  /* (e) la civilite */
  { nom: 'la vieille marque masculine l emporte', fichier: P,
    avant: "const civ = typeof fiche.civilite === 'string' && ABREGEE[fiche.civilite] ? fiche.civilite : null;",
    apres: "const civ = fiche.auMasculin === true ? 'monsieur' : typeof fiche.civilite === 'string' && ABREGEE[fiche.civilite] ? fiche.civilite : null;" },
  { nom: 'une civilite inventee', fichier: P,
    avant: "else if (!mot) juste = String(ecrit ?? '').replace(/\\s+/g, ' ').trim();", apres: 'else if (!mot) juste = `Mme ${prenom}`;' },
  { nom: 'le parent salue du nom de l enfant', fichier: P,
    avant: '  if (reste !== prenom) return null;\n', apres: '' },
  { nom: 'le texte du fil garde l ancien appel', fichier: P,
    avant: "const texteAuFil = typeof colis.texteAuFil === 'string' ? remplaceLAppel(colis.texteAuFil, ecrit.replace(/\\s+/g, ' ').trim(), juste) : undefined;",
    apres: 'const texteAuFil = colis.texteAuFil;' },
  { nom: 'le repli garde l ancien appel', fichier: P,
    avant: 'if (ecritRepli !== null && appelJuste(ecritRepli, ctx.fiche) === juste) {', apres: 'if (false) {' },
  { nom: 'l en-tete de la carte pris pour le corps', fichier: P,
    avant: "const corps = (composants ?? []).find((c) => String((c as CorpsDuModele)?.type ?? '').toLowerCase() === 'body') as CorpsDuModele | undefined;",
    apres: 'const corps = (composants ?? [])[0] as CorpsDuModele | undefined;' },
  /* La ligne prise, deja au fil */
  { nom: 'une ligne prise retrouvee au fil sans regarder la prise', fichier: P,
    avant: '&& instant(m.quand) >= prise - 60_000) ?? null;', apres: ') ?? null;' },
  /* Le facteur */
  { nom: 'la copie du facteur differe d un signe', fichier: EP,
    avant: 'export const JAMAIS_DEUX_FOIS_MS = 20 * 3_600_000;', apres: 'export const JAMAIS_DEUX_FOIS_MS = 21 * 3_600_000;' },
  { nom: 'le facteur ne passe pas la porte', fichier: EP,
    avant: 'const v = laPorte(devant, faits);', apres: "const v = { verdict: 'passe' } as VerdictDeLaPorte;" },
  { nom: 'le facteur retient en echec', fichier: EP,
    avant: "if (v.verdict === 'retenu') { await ecris({ statut: 'périmé', detail: detailDOpale(v.motif) });", apres: "if (v.verdict === 'retenu') { await ecris({ statut: 'échec', detail: v.motif });" },
  { nom: 'le facteur oublie la correction', fichier: EP,
    avant: 'colis = { ...colis, composants: v.composants,', apres: 'colis = { ...colis, composants: colis.composants,' },
  { nom: 'la main qui dit maintenant oubliee', fichier: EP,
    avant: 'id: l.id, parLaMain: l.data.parLaMain, colis: colis as ColisALaPorte };', apres: 'id: l.id, colis: colis as ColisALaPorte };' },
  { nom: 'la fiche de l enfant pour le parent', fichier: EP,
    avant: "const idFiche = String(l.pourId || l.clientId || '');", apres: "const idFiche = String(l.clientId || '');" },
  { nom: 'une lecture en panne laisse partir', fichier: EP,
    avant: '  if (fiche.error || voisines.error || fil.error || duFoyer.error) return null;\n', apres: '' },
  { nom: 'la ligne prise retombe en echec meme partie', fichier: EP,
    avant: 'auFil = partiAuFil(prise, ', apres: 'auFil = null && partiAuFil(prise, ' },
  { nom: 'le fil lu sous une seule forme du numero', fichier: EP,
    avant: ".in('data->>numero', variantes).gte('data->>quand', depuis).limit(500)", apres: ".eq('data->>numero', String(l.colis?.numero ?? '')).gte('data->>quand', depuis).limit(500)" },
  /* rappels-j1 */
  { nom: 'rappels-j1 redepose ce qu Opale a retenu', fichier: RJ,
    avant: "eq('data->>dateRdv', demain);\n  const deja = new Set(\n    (dejaRows ?? [])\n      .filter((r) => !SE_RETENTE.has((r.data as { statut?: string } | null)?.statut ?? '') || retenuParOpale(r.data as { detail?: unknown } | null))",
    apres: "eq('data->>dateRdv', demain);\n  const deja = new Set(\n    (dejaRows ?? [])\n      .filter((r) => !SE_RETENTE.has((r.data as { statut?: string } | null)?.statut ?? ''))" },
  { nom: 'rappels-j1 revient au numero tel quel', fichier: RJ,
    avant: 'if (tel && (dejaRemis.has(`${cleDuNumero(tel)}|tete|${a.clientId}`)', apres: 'if (tel && (dejaRemis.has(`${tel}|tete|${a.clientId}`)' },
  { nom: 'rappels-j1 compare le fil tel quel', fichier: RJ,
    avant: '...(r.data?.texte ? [`${cleDuNumero(r.data?.numero)}|texte|${texteSansCivilite(r.data.texte)}`] : []),', apres: '...(r.data?.texte ? [`${r.data?.numero}|texte|${r.data.texte}`] : []),' },
  { nom: 'rappels-j1 oublie la tete', fichier: RJ,
    avant: '      ...(r.data?.clientId ? [`${cleDuNumero(r.data?.numero)}|tete|${r.data.clientId}`] : []),\n', apres: '' },
  { nom: 'rappels-j1 lit une autre marque', fichier: RJ,
    avant: ".startsWith('retenu par Opale');", apres: ".startsWith('retenu');" },
];

const md5 = (rel) => createHash('md5').update(readFileSync(path.join(racine, rel))).digest('hex');

const lance = async (panne) => {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-la-porte-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-la-porte-des-modeles.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
      plugins: panne ? [{
        name: 'panne',
        setup(b) {
          b.onLoad({ filter: /\.(ts|tsx)$/ }, (args) => {
            const rel = path.relative(racine, args.path).split(path.sep).join('/');
            if (rel !== panne.fichier) return undefined;
            const contents = readFileSync(args.path, 'utf8').replace(/\r\n/g, '\n').split(panne.avant).join(panne.apres);
            return { contents, loader: rel.endsWith('.tsx') ? 'tsx' : 'ts', resolveDir: path.dirname(args.path) };
          });
        },
      }] : [],
      define: { __PANNE__: JSON.stringify(panne ?? null) },
    });
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
};

const prouve = process.argv.includes('--prouve');
const net = await lance(null);
process.stdout.write(net.stdout ?? '');
if (net.status !== 0) { process.stderr.write(net.stderr ?? ''); process.exit(1); }
if (prouve) {
  let muettes = 0;
  for (const p of PANNES) {
    const texte = readFileSync(path.join(racine, p.fichier), 'utf8').replace(/\r\n/g, '\n');
    const fois = texte.split(p.avant).length - 1;
    const avant = md5(p.fichier);
    let verdict;
    if (fois !== 1) verdict = `INTROUVABLE (${fois} fois)`;
    else {
      const r = await lance(p);
      verdict = r.status !== 0 ? 'CRIE ' : 'MUETTE';
    }
    if (md5(p.fichier) !== avant) verdict = `LE FICHIER A CHANGE (${verdict})`;
    if (verdict !== 'CRIE ') muettes++;
    console.log(`${verdict} ${p.nom}`);
  }
  if (muettes) { console.log(`\n${muettes} panne(s) muette(s) ou introuvable(s) : le banc ne voit pas tout.`); process.exit(1); }
  console.log(`\nLes ${PANNES.length} pannes crient.`);
}
