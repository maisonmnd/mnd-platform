import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LES PREVISIONS, EPROUVEES — 26 octobre 2026.
   `node scripts/verifie-les-previsions.mjs` : le banc, dans un
   processus fils (le paquet s'ecrit sous node_modules/.cache et s'efface
   dans un finally).
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc
   doit crier a chacune. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-les-previsions');
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-les-previsions.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error', external: ['esbuild'],
    });
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const PUR = 'src/shared/previsions-pur.ts';
const OBJ = 'src/shared/objectifs-des-fauteuils-pur.ts';
const ECRAN = 'src/apps/trone/routes/pilotage/Previsions.tsx';
const ROUTES = 'src/apps/trone/routes/index.tsx';
const MARKETING = 'src/apps/trone/routes/equipe/Marketing.tsx';
const PANNES = [
  ['le plafond pris au troisieme quartile', OBJ, 'plafond: quantile(tries, 0.9),', 'plafond: quantile(tries, 0.75),'],
  ['le marketing n est plus borne', PUR, 'const marketing = Math.min(marketingBrut, placesLibres);', 'const marketing = marketingBrut;'],
  ['un taux sans assez d envois', PUR, 'taux: n >= ENVOIS_POUR_MESURER ? revenues / n : null', 'taux: n > 0 ? revenues / n : null'],
  ['les nouvelles deja posees comptees deux fois', PUR, 'Math.max(0, attendues - e.nouvelles.dejaPosees)', 'attendues'],
  ['l honore du jour au taux', PUR, 'const venus = honores + (poses.length - honores) * h.taux;', 'const venus = poses.length * h.taux;'],
  ['un rendez-vous annule vaut reponse', PUR, "if (!a.creeLe || a.status === 'annulé') continue;", 'if (!a.creeLe) continue;'],
  ['les reprises hors horizon comptent', PUR, 'const reprises = e.reprises.filter((r) => dans(r.iso));', 'const reprises = e.reprises;'],
  ['les jours fermes ont un plafond', PUR, 'if (!e.ouvertLe(j) && (e.parJour.get(j) ?? 0) === 0) continue;', 'if (!e.ouvertLe(j) && (e.parJour.get(j) ?? 0) < 0) continue;'],
  ['un envoi en salle compte', PUR, 'if (!e.clientId || attendEncore(e)) continue;', 'if (!e.clientId) continue;'],
  ['les quatorze jours pas ecoules', PUR, 'jour < depuis || jour > jusqua', 'jour < depuis || jour > aujourdhui'],
  ['la cliente en retard attendue', PUR, "if (o.retardJours > 0) return 'retard';", "if (o.retardJours > 99999) return 'retard';"],
  ['un jour sans plafond en ligne', PUR, '(l): l is JourDuPlafond => !!l && l.rdv > 0', '(l): l is JourDuPlafond => !!l'],
  ['le mois toujours en cours', PUR, 'Number(aujourdhui.slice(8, 10)) <= 15 ?', 'Number(aujourdhui.slice(8, 10)) <= 31 ?'],
  ['l ecran mesure le mauvais envoi', ECRAN, "e.type === 'reprise-j3'", "e.type === 'rappel-j1'"],
  ['la rubrique oubliee des ecrans nes apres', ROUTES, "'/avis-google', '/previsions'];", "'/avis-google'];"],
  ['le rejeu regarde l avenir', PUR, "else if (a.creeLe && a.creeLe.slice(0, 10) < premier) out.push({ ...a, status: 'confirmé' } as T);", "else out.push({ ...a, status: 'confirmé' } as T);"],
  ['le rejeu garde le sort d aujourd hui', PUR, "out.push({ ...a, status: 'confirmé' } as T);", 'out.push(a);'],
  ['une venue sans la regle du Carnet', PUR, "(a.date < aujourdhui && a.status !== 'annulé' && (!!a.encaisse || !!a.facture))", 'false'],
  ['l honneur sans les passes non venus', PUR, 'venus / passes.length', 'venus / (venus + annules)'],
  ['la fourchette sans son bas', PUR, 'venus >= Math.floor(p.bas) && venus <= Math.ceil(p.haut)', 'venus <= Math.ceil(p.haut)'],
  ['l ecart moyen garde son signe', PUR, 'const sansSigne = somme(juges, (x) => Math.abs(x.ecart));', 'const sansSigne = somme(juges, (x) => x.ecart);'],
  ['un mois sans posés connus est jugé', PUR, "export const seJuge = (mois: string): boolean => `${mois}-01` > PRISE_NOTEE_DEPUIS;", 'export const seJuge = (mois: string): boolean => mois.length > 0;'],
  ['le resume juge aussi les mois non juges', PUR, 'const juges = l.filter((x) => x.juge);', 'const juges = l;'],
  ['l ecran rejoue avec la Cadence d aujourd hui', ECRAN, 'predictNextVisit(siens, [c], c.id, premier)', 'predictNextVisit(siens, [c], c.id, today)'],
  ['le Marketing n ouvre plus la campagne', MARKETING, 'if (estUneAudienceConnue(aEcrire)) ecrireA(aEcrire);', 'void estUneAudienceConnue;'],
];

const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');

if (!prouve) {
  const r = await lanceLeBanc();
  process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
  process.exitCode = r.status ?? 1;
} else {
  const propre = await lanceLeBanc();
  if (propre.status !== 0) { console.log('Le banc ne passe pas sur le code propre :'); console.log(propre.stdout); process.exit(1); }
  const fichiers = [...new Set(PANNES.map((p) => p[1]))];
  const avant = Object.fromEntries(fichiers.map((f) => [f, md5(f)]));
  const gardes = Object.fromEntries(fichiers.map((f) => [f, readFileSync(path.join(racine, f))]));
  let muettes = 0;
  try {
    for (const [nom, fichier, a, b] of PANNES) {
      const brut = gardes[fichier].toString('utf8');
      const crlf = brut.includes('\r\n');
      const texte = brut.replace(/\r\n/g, '\n');
      if (!texte.includes(a)) { console.log(`INTROUVABLE ${nom}`); muettes++; continue; }
      const casse = texte.replace(a, b);
      writeFileSync(path.join(racine, fichier), crlf ? casse.replace(/\n/g, '\r\n') : casse);
      try {
        const r = await lanceLeBanc();
        if (r.status === 0) { console.log(`MUETTE ${nom}`); muettes++; } else console.log(`CRIE  ${nom}`);
      } finally {
        writeFileSync(path.join(racine, fichier), gardes[fichier]);
      }
    }
  } finally {
    for (const f of fichiers) writeFileSync(path.join(racine, f), gardes[f]);
  }
  const intacts = fichiers.every((f) => md5(f) === avant[f]);
  console.log(intacts ? 'Fichiers rendus a l identique.' : 'ATTENTION : un fichier n est pas revenu a l identique.');
  console.log(muettes === 0 && intacts ? `\nLa preuve tient : ${PANNES.length} fautes, le banc crie a chacune.` : `\n${muettes} faute(s) sans cri.`);
  process.exitCode = muettes === 0 && intacts ? 0 : 1;
}
