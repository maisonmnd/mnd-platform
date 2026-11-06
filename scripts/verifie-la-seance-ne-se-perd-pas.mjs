import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* UNE SEANCE MANQUEE NE SE PERD PAS, EPROUVE - 6 novembre 2026.
   `node scripts/verifie-la-seance-ne-se-perd-pas.mjs` : le banc, dans un
   processus fils (le paquet s'ecrit sous node_modules/.cache et s'efface).
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc
   doit crier a chacune. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

const JUGE = 'src/shared/abonnee-pur.ts';
const SQL = 'supabase/migrations/0169_une_seance_manquee_ne_se_perd_pas.sql';
const REL = 'supabase/functions/relances-factures/index.ts';
const C = 'src/apps/couronne/';
const T = 'src/apps/trone/routes/clients/';
const PROMESSE = "t('Une séance annulée ou manquée n’est jamais perdue : elle revient à votre formule.')";
const ANCIENNE = "t('La séance est comptée et marquée « Manquée ». Pour un motif justifié, la Maison peut la rendre.')";
const PANNES = [
  ['le juge recompte une absente', JUGE, "  if (a.absente || a.status === 'annulé') return 'annulee';", "  if (a.status === 'annulé') return 'annulee';"],
  ['le juge recompte une annulee', JUGE, "const prendUnCredit = (etat: EtatSeance): boolean => etat !== 'annulee';", 'const prendUnCredit = (etat: EtatSeance): boolean => !!etat;'],
  ['le prorata recompte ce qui n est pas fait', JUGE, "attribuees.filter((s) => s.compte && s.etat === 'faite').length;", 'attribuees.filter((s) => s.etat === \'faite\' || s.etat === \'annulee\').length;'],
  ['la base redit manquee', SQL, "  if public.abo_vrai(a->'absente') or v_st = 'annulé' then\n    return 'annulee';", "  if public.abo_vrai(a->'absente') or v_st = 'annulé' then\n    return 'manquee';"],
  ['la base rend le credit a la carte', SQL, "  select public.abo_etat_de_la_seance(a, jour) <> 'annulee';", '  select true;'],
  ['les relances redisent manquee', REL, "  if (a.absente || a.status === 'annulé') return 'annulee';", "  if (a.absente) return 'manquee';\n  if (a.status === 'annulé') return 'annulee';"],
  ['le prorata des relances compte autre chose que les faites', REL, "    return etatDeLaSeance(a, jour) === 'faite';", "    return etatDeLaSeance(a, jour) !== 'annulee';"],
  ['l achat fait de nouveau accepter une seance comptee', C + 'AchatFormule.tsx', "t('J’ai lu ce qui est convenu : les séances non prises à la date de fin sont perdues.')", "t('J’ai lu ce qui est convenu : les séances non prises à la date de fin sont perdues ; à moins de 24 h, ou absente, la séance est comptée.')"],
  ['l achat ne dit plus la promesse', C + 'AchatFormule.tsx', PROMESSE, ANCIENNE],
  ['ce qui est convenu redit comptee', C + 'SesFormules.tsx', `    [t('Annuler ou déplacer'), ${PROMESSE}],\n    [t('Reporter'),`, `    [t('Annuler ou déplacer'), ${ANCIENNE}],\n    [t('Reporter'),`],
  ['annuler pres de l heure redit comptee', C + 'MesRendezVous.tsx', "      : { texte: t('Rien n’est compté, la séance revient à votre formule.'), compte: false };", "      : { texte: t('À moins de 24 h : la séance sera comptée.'), compte: true };"],
  ['la reservation d une incluse redit comptee', C + 'ReserverIncluse.tsx', "t('Sans acompte. Annulée ou manquée, une séance n’est jamais perdue : elle revient à votre formule.')", "t('Sans acompte. À moins de 24 h, ou absente, elle est comptée.')"],
  ['la pastille Manquee revient', C + 'releve.ts', "  annulee: { dit: 'Annulée', cls: '' },", "  annulee: { dit: 'Annulée', cls: '' },\n  manquee: { dit: 'Manquée', cls: 'mc-stchip--off' },"],
  ['le dictionnaire anglais reparle de Missed', C + 'i18n/en-abonnee.ts', "  'Lune à régler': 'Moon to pay',", "  'Lune à régler': 'Moon to pay',\n  'Manquée': 'Missed',"],
  ['le Trone remarque manquee', T + 'SeanceDeLaFormule.tsx', '          Absente : annuler la séance', '          Absente : marquer manquée'],
  ['le Trone rend de nouveau une seance', T + 'CarteAbonnement.tsx', "onClick={() => ouvre(c.sub.id, 'resilier')}>Résilier daté</button>", "onClick={() => ouvre(c.sub.id, 'resilier')}>Résilier daté</button>\n              <button type=\"button\">Rendre la séance</button>"],
  ['le geste absente redit comptee', T + 'gestes-de-l-abonnement.ts', "    laClienteLit: 'Annulée, la séance revient à votre formule.',\n  };\n}\n\nconst metsAJour", "    laClienteLit: 'Manquée · comptée.',\n  };\n}\n\nconst metsAJour"],
  ['le comptoir redemande qui annule', T + '_shared.tsx', "    const parQui: 'maison' | null = appt.coveredBySub && appt.coverKind !== 'forfait' ? 'maison' : null;", "    const parQui: 'cliente' | 'maison' | null = appt.coveredBySub ? ((await demande({ quoi: 'Séance de sa formule', titre: 'Qui annule cette séance ?', dit: '', accepter: 'La cliente annule', refuser: 'La Maison annule' })) ? 'cliente' : 'maison') : null;"],
];

const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-la-seance-ne-se-perd-pas');
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-la-seance-ne-se-perd-pas.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error', loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
    });
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

if (prouve) {
  const propre = spawnSync(process.execPath, [import.meta.filename], { encoding: 'utf8' });
  if (propre.status !== 0) { console.log('Le banc ne passe pas sur le code propre :'); console.log(propre.stdout, propre.stderr); process.exit(1); }
  const fichiers = [...new Set(PANNES.map((x) => x[1]))];
  const gardes = new Map(fichiers.map((f) => [f, readFileSync(path.join(racine, f))]));
  const avant = new Map(fichiers.map((f) => [f, md5(f)]));
  let muettes = 0;
  try {
    for (const [nom, f, a, b] of PANNES) {
      const garde = gardes.get(f);
      const brut = garde.toString('utf8');
      const crlf = brut.includes('\r\n');
      const texte = brut.replace(/\r\n/g, '\n');
      if (texte.split(a).length !== 2) { console.log(`INTROUVABLE ${nom}`); muettes++; continue; }
      const casse = texte.replace(a, b);
      writeFileSync(path.join(racine, f), crlf ? casse.replace(/\n/g, '\r\n') : casse);
      try {
        const r = spawnSync(process.execPath, [import.meta.filename], { encoding: 'utf8' });
        if (r.status === 0) { console.log(`MUETTE ${nom}`); muettes++; } else console.log(`CRIE  ${nom}`);
      } finally {
        writeFileSync(path.join(racine, f), garde);
      }
    }
  } finally {
    for (const [f, g] of gardes) writeFileSync(path.join(racine, f), g);
  }
  const intacts = fichiers.every((f) => md5(f) === avant.get(f));
  console.log(intacts ? 'Fichiers rendus a l identique.' : 'ATTENTION : un fichier n est pas revenu a l identique.');
  console.log(muettes === 0 && intacts ? `\nLa preuve tient : ${PANNES.length} fautes, le banc crie a chacune.` : `\n${muettes} faute(s) sans cri.`);
  process.exit(muettes === 0 && intacts ? 0 : 1);
}

const r = await lanceLeBanc();
process.stdout.write(r.stdout ?? '');
if (r.stderr) process.stdout.write(r.stderr);
process.exit(r.status ?? 1);
