import { build } from 'esbuild';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

/* LA REVUE CLIENTS-COEUR, EPROUVEE — `node scripts/verifie-revue-clients-coeur.mjs`.

   10 octobre 2026 : six constats de la revue de code (57, 58, 59, 60, 78,
   104), corriges dans l'ecran d'encaissement, la fenetre du rendez-vous, les
   remises du comptoir et le blocage du Salon Souverain. Le banc vit dans
   `verifie-revue-clients-coeur.harnais.ts`.

   `--prouve` remet chaque faute UNE A UNE dans le vrai fichier (copie de
   sauvegarde, remplacement, banc, restauration dans un finally, empreinte md5
   identique apres) et exige que le banc crie a l'endroit attendu. Un banc qui
   passe sur le code fautif ne prouve rien. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');
const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-revue-clients-coeur-'));
const sortie = path.join(dossier, 'harnais.mjs');

/* Les fautes, telles que le code les portait avant la correction. `ecrie` :
   la ligne du banc qui doit tomber en ECHEC. */
const ACTIONS = 'src/apps/trone/routes/clients/actions.tsx';
const SHARED = 'src/apps/trone/routes/clients/_shared.tsx';
const OFFRES = 'src/shared/offres-pur.ts';
const BLOCAGES = 'src/shared/blocages.ts';
const BOOKING = 'src/apps/couronne/Booking.tsx';
const FAUTES = [
  { n: '57', fichier: ACTIONS, ecrie: '[57] la Gamme seule fige le prix',
    avant: 'const prixFige = e.settleTotal > 0 || e.totalGamme > 0 ? prixAFiger(appt, byId) : {};',
    apres: 'const prixFige = e.settleTotal > 0 ? prixAFiger(appt, byId) : {};' },
  { n: '58 (cumul recopie)', fichier: SHARED, ecrie: '[58] la part famille suit, pas le geste manuel',
    avant: 'const part = Math.min(cumul, Math.max(0, Math.round(appt.remiseFamilleXof)));',
    apres: 'const part = cumul;' },
  /* Reprise du 10 octobre 2026 (relecture) : « rien ne suit » doit ECRASER le
     drapeau que `sansLaVisite` laisse ; `{}` le laisserait vivre. */
  { n: '58 (drapeau, sans remise)', fichier: SHARED, ecrie: '[58] rien ne suit : les cles',
    avant: 'if (!appt.remiseFamille || cumul <= 0) return { remiseFamille: undefined, remiseFamilleXof: undefined };',
    apres: 'if (!appt.remiseFamille || cumul <= 0) return {};' },
  { n: '58 (drapeau, part nulle)', fichier: SHARED, ecrie: '[58] rien ne suit : les cles',
    avant: '      ? { discountXof: part, remiseFamille: true, remiseFamilleXof: part }\n      : { remiseFamille: undefined, remiseFamilleXof: undefined };',
    apres: '      ? { discountXof: part, remiseFamille: true, remiseFamilleXof: part }\n      : {};' },
  { n: '58 (drapeau, voie ancienne)', fichier: SHARED, ecrie: '[58] rien ne suit : les cles',
    avant: 'return part > 0 ? { discountXof: part, remiseFamille: true } : { remiseFamille: undefined, remiseFamilleXof: undefined };',
    apres: 'return part > 0 ? { discountXof: part, remiseFamille: true } : {};' },
  /* Booking.tsx appartient a un autre lot, qui remet ses propres fautes dans
     le vrai fichier : y ecrire la notre puis restaurer pourrait effacer une
     ligne de l'autre equipe, ou lui faire sauvegarder notre faute. La faute
     s'ecrit donc dans une COPIE, que le banc lit par REVUE_BOOKING. */
  { n: '58 (Ma Couronne muette)', fichier: BOOKING, surCopie: 'REVUE_BOOKING', ecrie: '[58] Ma Couronne ecrit la part famille a part',
    avant: '{ discountXof: famRemiseXof, remiseFamille: true, remiseFamilleXof: famRemiseXof }',
    apres: '{ discountXof: famRemiseXof, remiseFamille: true }' },
  { n: '58 (fenetre muette)', fichier: SHARED, ecrie: '[58] la fenetre ecrit la part famille a part',
    avant: "        remiseFamilleXof: !effCovered && !forfaitPose && remiseEstFamille ? (remiseFamilleXof || undefined) : undefined,\n        /* Couvert par l'abonnement",
    apres: "        /* Couvert par l'abonnement" },
  { n: '59 (annulation)', fichier: ACTIONS, ecrie: '[59] annuler l encaissement : la remise s en va',
    avant: '        ...remiseDuComptoirRendue(a),\n      }\n    : a)));\n  return { invoicesRemoved };',
    apres: '      }\n    : a)));\n  return { invoicesRemoved };' },
  { n: '59 (piece supprimee)', fichier: ACTIONS, ecrie: '[59] supprimer la derniere piece',
    avant: '        ...(newPaid <= 0 && journal.length === 0 ? remiseDuComptoirRendue(a) : {}),',
    apres: '' },
  { n: '59 (remise a zero)', fichier: ACTIONS, ecrie: '[59] remise a zero des encaissements',
    avant: ': a), ...remiseDuComptoirRendue(a), paidXof: undefined, invoiceId: undefined, pointsAwarded: false }',
    apres: ': a), paidXof: undefined, invoiceId: undefined, pointsAwarded: false }' },
  { n: '59 (bouton sans marqueur)', fichier: ACTIONS, ecrie: '[59] le bouton',
    avant: '? { ...a, ...remiseDuComptoirEcrite(a, aReporter.xof) }',
    apres: '? { ...a, discountXof: (a.discountXof ?? 0) + aReporter.xof }' },
  { n: '78 (deja recue ignoree)', fichier: OFFRES, ecrie: '[78] deja remise par le comptoir',
    avant: 'const manque = surLesPieces - Math.max(0, Math.round(e.remiseDejaSurLeRdvXof ?? 0));',
    apres: 'const manque = surLesPieces;' },
  { n: '60 (famille reportee)', fichier: OFFRES, ecrie: '[60] une piece',
    avant: '!!f.discountLabel && f.discountLabel !== LIBELLE_REMISE_FAMILLE',
    apres: '!!f.discountLabel' },
  { n: '60 (ecran muet)', fichier: ACTIONS, ecrie: '[60] l ecran passe ce que le rendez-vous a deja recu',
    avant: '            remiseDejaSurLeRdvXof: appt.discountXof ?? 0,\n',
    apres: '' },
  { n: '104 (motif nomme)', fichier: BLOCAGES, ecrie: '[104] le motif ne porte que le rendez-vous',
    avant: 'motif: `${marque} · Salon Souverain`,',
    apres: "motif: `${marque} · Salon Souverain${p.qui ? `, ${p.qui}` : ''}`," },
  { n: '104 (fenetre nomme)', fichier: SHARED, ecrie: '[104] la fenetre du rendez-vous ne passe aucun nom',
    avant: '        debut: enHeure(debutMin), fin: enHeure(Math.min(finMin, 24 * 60)),\n      });',
    apres: '        debut: enHeure(debutMin), fin: enHeure(Math.min(finMin, 24 * 60)),\n        qui: rdvClient?.name,\n      });' },
];

async function construis() {
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-revue-clients-coeur.harnais.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: sortie,
    logLevel: 'error',
    loader: { '.css': 'empty' },
    define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
    banner: {
      /* Le meme decor que le banc du Carnet : une horloge reglable, un
         document qui supporte les bandeaux de `toast`, une fenetre qui
         transmet ses evenements aux abonnes des magasins. */
      js: `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.__horloge = Date.parse('2026-10-09T12:00:00Z');
const __D = Date;
globalThis.Date = class extends __D {
  constructor(...a) { a.length ? super(...a) : super(globalThis.__horloge); }
  static now() { return globalThis.__horloge; }
};
globalThis.__bandeaux = [];
globalThis.document = {
  body: { dataset: {}, appendChild(el) { globalThis.__bandeaux.push(el.textContent); } },
  addEventListener() {},
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {} }, remove() {} }),
  querySelectorAll: () => [],
};
const __ecoutes = new Map();
globalThis.window = {
  addEventListener(t, f) { if (!__ecoutes.has(t)) __ecoutes.set(t, []); __ecoutes.get(t).push(f); },
  dispatchEvent(e) { for (const f of __ecoutes.get(e.type) ?? []) f(e); return true; },
  location: { href: '', hash: '' }, setTimeout: () => 0,
};
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`,
    },
  });
}

/* Le banc dans un processus fils : il finit par `process.exit`, et le
   lanceur doit pouvoir atteindre son `finally`. */
const lanceLeBanc = (muet, env = {}) => {
  const r = spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8', env: { ...process.env, ...env } });
  const texte = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (!muet) process.stdout.write(texte);
  return { status: r.status ?? 1, texte };
};
const md5 = (f) => createHash('md5').update(readFileSync(f)).digest('hex');

try {
  if (!prouve) {
    await construis();
    process.exitCode = lanceLeBanc(false).status;
  } else {
    let tiennent = 0;
    for (const faute of FAUTES) {
      const fichier = path.join(racine, faute.fichier);
      const copie = path.join(dossier, `${path.basename(fichier)}.sauve`);
      const empreinte = md5(fichier);
      copyFileSync(fichier, copie);
      let verdict = '';
      try {
        const brut = readFileSync(fichier, 'utf8');
        const crlf = brut.includes('\r\n');
        const lf = crlf ? brut.replace(/\r\n/g, '\n') : brut;
        const n = lf.split(faute.avant).length - 1;
        if (n !== 1) {
          verdict = `FAUTE INTROUVABLE (${n} fois) : le code a bouge, la preuve ne tient pas`;
        } else {
          const fautif = lf.replace(faute.avant, () => faute.apres);
          let env = {};
          if (faute.surCopie) {
            const copieFautive = path.join(dossier, `fautif-${path.basename(fichier)}`);
            writeFileSync(copieFautive, fautif);
            env = { [faute.surCopie]: copieFautive };
          } else {
            writeFileSync(fichier, crlf ? fautif.replace(/\n/g, '\r\n') : fautif);
          }
          await construis();
          const r = lanceLeBanc(true, env);
          const crie = r.status !== 0 && r.texte.split(/\r?\n/).some((l) => l.startsWith(`ECHEC ${faute.ecrie}`));
          verdict = crie ? 'le banc crie' : 'LE BANC NE CRIE PAS';
          if (crie) tiennent++;
          if (!crie) process.stdout.write(r.texte);
        }
      } finally {
        /* Une faute ecrite sur copie n'a pas touche le vrai fichier : on ne
           le recopie pas, pour ne jamais ecraser une ligne ecrite entre-temps
           par l'equipe qui le tient. */
        if (!faute.surCopie) copyFileSync(copie, fichier);
      }
      const intact = md5(fichier) === empreinte;
      console.log(`Faute ${faute.n.padEnd(26)} -> ${verdict} ; fichier restaure ${intact ? 'a l identique (md5)' : 'DIFFERENT, A VERIFIER'}`);
      if (!intact) process.exitCode = 1;
    }
    await construis();
    const final = lanceLeBanc(true);
    console.log(`\nLe banc sur le code corrige, apres restauration : ${final.status === 0 ? 'vert' : 'ROUGE'}`);
    const tient = tiennent === FAUTES.length && final.status === 0 && process.exitCode !== 1;
    console.log(tient
      ? `La preuve tient : ${tiennent} fautes sur ${FAUTES.length} font crier le banc.`
      : `LA PREUVE NE TIENT PAS : ${tiennent} fautes sur ${FAUTES.length} font crier le banc.`);
    process.exitCode = tient ? 0 : 1;
  }
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
