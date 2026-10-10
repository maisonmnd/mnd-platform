import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

/* LA REVUE DU 10 OCTOBRE 2026, LOT « MESSAGES », EPROUVEE —
   `node scripts/verifie-revue-messages.mjs`.

   Le banc vit dans `verifie-revue-messages.harnais.ts` et tourne dans un
   processus fils (un `process.exit` du banc ne tue pas le lanceur avant son
   `finally` : le dossier temporaire s'efface toujours).

   `--prouve` REMET CHAQUE FAUTE, UNE A UNE : le fichier est lu, son empreinte
   prise, la faute d'avant reposee a la place de la correction, le banc
   rejoue, puis le fichier rendu tel quel dans un `finally` et son empreinte
   comparee. Le banc doit crier sur l'epreuve de CETTE faute, sinon il ne
   prouve rien. Les motifs sont entre apostrophes droites, jamais dans un
   gabarit : un `${...}` y serait evalue, et le controle serait mort. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

const BANNIERE = `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }, location: { href: '', hash: '' } };
globalThis.document = {
  body: { dataset: {}, appendChild() {} },
  addEventListener() {},
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {} }, click() {}, remove() {} }),
  querySelectorAll: () => [],
};
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`;

/** Un passage du banc : construit, lance dans un fils, rend sa sortie. */
async function banc(muet) {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-revue-messages-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-revue-messages.harnais.ts')],
      bundle: true,
      format: 'esm',
      platform: 'node',
      outfile: sortie,
      logLevel: 'error',
      loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
      banner: { js: BANNIERE },
    });
    const r = spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8', timeout: 120_000 });
    const texte = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    if (!muet) process.stdout.write(texte);
    return { status: r.status ?? 1, texte };
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

/* LES FAUTES D'AVANT, une par constat (ou par chemin d'un constat). `cri`
   est le debut du nom de l'epreuve qui doit tomber. */
const FAUTES = [
  { n: 'n7', f: 'src/apps/trone/routes/clients/Conversations.tsx', cri: 'n7 le demontage',
    paires: [['  useEffect(() => () => {\n    const a = attenteEnCours.current;\n    if (a) partirUneFoisRef.current(a);\n  }, []);', '']] },
  { n: 'n8', f: 'src/apps/trone/routes/clients/Conversations.tsx', cri: 'n8 le message suivant',
    paires: [['if (enAttente) { const a = enAttente; setEnAttente(null); partirUneFois(a); }', 'if (enAttente) void partir(enAttente);']] },
  { n: 'n9 (ecran)', f: 'src/apps/trone/routes/clients/Conversations.tsx', cri: 'n9 la borne de taille',
    paires: [['      if (!partEnFermant(JSON.stringify(corps))) { gardeUnAppel(\'whatsapp-envoi\', corps, `WhatsApp au ${a.numero}`); return; }\n', '']] },
  { n: 'n9 (borne)', f: 'src/shared/conversations.ts', cri: 'n9 une photo de 50 Ko',
    paires: [['  new TextEncoder().encode(corpsJson).length <= KEEPALIVE_MAX_OCTETS;', '  true;']] },
  { n: 'n10 (juge)', f: 'src/shared/conversations.ts', cri: 'n10 fiche a deux numeros',
    paires: [['  return { geste: \'remplacer\', champ: \'phone2\', ancien: second };', '  return { geste: \'ecrire\', champ: \'phone2\' };']] },
  { n: 'n10 (ecran)', f: 'src/apps/trone/routes/clients/Conversations.tsx', cri: 'n10 l ecran demande',
    paires: [['    if (r.geste === \'remplacer\' && !await demande({', '    if (false && !await demande({']] },
  { n: 'n11', f: 'src/shared/gestes-conversation.ts', cri: 'n11 un jour du geste',
    paires: [['  return `${JOURS[d.getDay()]} ${j} ${MOIS[m - 1]} ${a}`;', '  return `${JOURS[d.getDay()]} ${j} ${MOIS[m - 1]}`;']] },
  { n: 'n12 (juge)', f: 'src/shared/conversations.ts', cri: 'n12 le dernier qui compte',
    paires: [['      dernier,\n      dernierQuiCompte,\n', '      dernier,\n      dernierQuiCompte: dernier,\n']] },
  { n: 'n12 (alarme)', f: 'src/apps/trone/routes/pilotage/AlarmeWhatsApp.tsx', cri: 'n12 l alarme lit',
    paires: [['  const m: MessageWa = f.dernierQuiCompte;', '  const m: MessageWa = f.dernier;']] },
  { n: 'n13', f: 'src/shared/partage-whatsapp.ts', cri: 'n13 l onglet ouvert',
    paires: [['  const w = window.open(lien, \'_blank\');', '  const w = window.open(lien, \'_blank\', \'noopener\');']] },
  { n: 'n14', f: 'src/shared/sonnette.ts', cri: 'n14 le geste suivant',
    paires: [
      ['export const laSonnetteEstArmee = (): boolean => contexte?.state === \'running\';',
        'let armee = false;\nexport const laSonnetteEstArmee = (): boolean => armee;'],
      ['  const ctx = leContexte();\n  if (!ctx || ctx.state === \'running\') return;\n  void ctx.resume().catch(() => { /* le geste suivant réessaiera */ });',
        '  if (armee) return;\n  const ctx = leContexte();\n  if (!ctx) return;\n  void ctx.resume().then(() => { armee = ctx.state === \'running\'; }).catch(() => { armee = false; });'],
    ] },
  { n: 'n73 (relance)', f: 'src/shared/rappel.ts', cri: 'n73 la relance J-3',
    paires: [['prochain rendez-vous est prévu le ${jourLisible(o.jourIso, o.aujourdhuiIso, true)}', 'prochain rendez-vous est prévu le ${jourLisible(o.jourIso, o.aujourdhuiIso)}']] },
  { n: 'n73 (rappel)', f: 'src/shared/rappel.ts', cri: 'n73 le rappel au-dela',
    paires: [['}, toujoursLAnnee = true): string {', '}, toujoursLAnnee = false): string {']] },
  { n: 'n74', f: 'src/shared/fin-de-paquet.ts', cri: 'n74 n75 un abonne',
    paires: [['`valable jusqu’au ${jourEtAn(f.jusquau)}`', '`valable jusqu’au ${jourDit(f.jusquau)}`']] },
  { n: 'n75', f: 'src/shared/fin-de-paquet.ts', cri: 'n75 une fiche muette',
    paires: [['  appelDe(fiche, f.nom),', '  (f.nom.trim().split(/\\s+/)[0] || \'Madame\'),']] },
  { n: 'n76', f: 'src/shared/demandes.ts', cri: 'n76 une demande ou',
    paires: [['  const appel = appelDe({ name: d.prenom, civilite: d.civilite });', '  const appel = d.prenom.trim() || \'Madame\';']] },
  { n: 'n80 (annee)', f: 'src/shared/promos.ts', cri: 'n80 l instant porte',
    paires: [['${mois[d.getUTCMonth()]} ${d.getUTCFullYear()} à ${heure}', '${mois[d.getUTCMonth()]} à ${heure}']] },
  { n: 'n80 (appel)', f: 'src/apps/trone/routes/clients/_gestes.tsx', cri: 'n80 le message du code',
    paires: [['const message = `${appel}, la Maison vous offre', 'const message = `${prenom}, la Maison vous offre']] },
  { n: 'n86 (mot)', f: 'src/shared/bilan-document.ts', cri: 'n86 le mot du bilan',
    paires: [['voici le bilan de votre séance du ${dateDite(b.date)}', 'voici le bilan de votre séance du ${jourDit(b.date)}']] },
  { n: 'n86 (modele)', f: 'src/shared/bilan-document.ts', cri: 'n86 les variables',
    paires: [['[appelDe(c), dateDite(b.date)]', '[appelDe(c), jourDit(b.date)]']] },
  { n: 'n86 (notification)', f: 'src/shared/bilan-document.ts', cri: 'n86 la notification',
    paires: [['votre bilan du ${dateDite(b.date)} est prêt', 'votre bilan du ${jourDit(b.date)} est prêt']] },
  /* Reprise du 10 octobre 2026 : les echantillons documentes des modeles
     Meta, remis a leur forme d'avant n74, n75 et n86. */
  { n: 'reprise (doc v1)', f: 'docs/BRANCHER-ENVOIS.md', cri: 'reprise doc fin_de_paquet v1',
    paires: [['({{1}} = son appel, civilité comprise, « Madame Awa », {{2}}', '({{1}} = prénom, « Awa », {{2}}']] },
  { n: 'reprise (doc v4)', f: 'docs/BRANCHER-ENVOIS.md', cri: 'reprise doc fin_de_paquet v4',
    paires: [['{{4}} = « valable jusqu\'au\n12 juin 2027 »', '{{4}} = « valable jusqu\'au\n12 juin »']] },
  { n: 'reprise (doc bilan)', f: 'docs/BRANCHER-ENVOIS.md', cri: 'reprise doc bilan_de_seance v2',
    paires: [['{{2}} = « 4 octobre 2026 », avec l\'année.)', '{{2}} = « 4 octobre ».)']] },
];

const empreinte = (s) => createHash('md5').update(s).digest('hex');

if (!prouve) {
  const r = await banc(false);
  process.exitCode = r.status;
} else {
  let faux = 0;
  const net = await banc(true);
  console.log(`Code corrige : ${net.status === 0 ? 'le banc passe' : 'LE BANC ECHOUE'}`);
  if (net.status !== 0) { process.stdout.write(net.texte); faux++; }
  for (const faute of FAUTES) {
    const p = path.join(racine, faute.f);
    const avant = readFileSync(p, 'utf8');
    const md5Avant = empreinte(avant);
    let reponse = '';
    let restaure = false;
    try {
      let fautif = avant;
      /* Les fins de ligne du fichier : certains sont en CRLF (Windows), les
         motifs s'y plient. */
      const fin = avant.includes('\r\n') ? '\r\n' : '\n';
      for (const [brutCorrige, brutAncien] of faute.paires) {
        const corrige = brutCorrige.replace(/\n/g, fin);
        const ancien = brutAncien.replace(/\n/g, fin);
        const n = fautif.split(corrige).length - 1;
        if (n !== 1) throw new Error(`motif trouve ${n} fois dans ${faute.f} : ${corrige.slice(0, 60)}`);
        fautif = fautif.replace(corrige, () => ancien);
      }
      writeFileSync(p, fautif);
      const r = await banc(true);
      const echec = new RegExp(`^ECHEC ${faute.cri}`, 'm').test(r.texte);
      reponse = r.status !== 0 && echec ? 'le banc crie' : `LE BANC SE TAIT (statut ${r.status})`;
      if (!(r.status !== 0 && echec)) faux++;
    } catch (e) {
      reponse = `IMPOSSIBLE : ${e.message}`;
      faux++;
    } finally {
      writeFileSync(p, avant);
      restaure = empreinte(readFileSync(p, 'utf8')) === md5Avant;
      if (!restaure) faux++;
    }
    console.log(`${faute.n.padEnd(20)} ${reponse.padEnd(28)} md5 ${md5Avant} ${restaure ? 'rendu identique' : 'NON RENDU'}`);
  }
  console.log(faux === 0
    ? `\nLa preuve tient : ${FAUTES.length} fautes remises, le banc crie sur chacune, chaque fichier rendu octet pour octet.`
    : `\nLA PREUVE NE TIENT PAS (${faux} defaut(s)).`);
  process.exitCode = faux === 0 ? 0 : 1;
}
