import { build, transform } from 'esbuild';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* L'ACCORD DES NOUVELLES, D'UN BOUTON, EPROUVE (26 novembre 2026).
   `node scripts/verifie-l-accord-d-un-bouton.mjs` lance le harnais ;
   `--prouve` le relance sur chaque panne ci-dessous, et chaque panne doit le
   faire crier par une epreuve. Les pannes vivent dans la memoire du bundle
   (un greffon d'esbuild remplace le texte lu), dans la fonction transpilee,
   ou dans une copie hors du depot pour les fichiers que le harnais LIT :
   rien de l'arbre partage ne bouge. */

const racine = path.resolve(import.meta.dirname, '..');
const PUR = 'src/shared/accord-des-nouvelles-pur.ts';
const FN = 'supabase/functions/regler-la-seance/index.ts';
const APP = 'src/apps/regler/App.tsx';
const NOUV = 'src/apps/regler/Nouvelles.tsx';
const CPT = 'src/apps/trone/routes/clients/AccordDesNouvelles.tsx';
const SH = 'src/apps/trone/routes/clients/_shared.tsx';
const ACT = 'src/apps/trone/routes/clients/actions.tsx';
const CUS = 'src/apps/trone/routes/clients/Customers.tsx';
const COUR = 'src/apps/couronne/LesNouvellesDeLaMaison.tsx';
const TABS = 'src/apps/couronne/Tabs.tsx';
const EN = 'src/apps/couronne/i18n/en-commun.ts';
const TDB = 'src/apps/trone/routes/pilotage/Dashboard.tsx';
const AUD = 'src/shared/audiences-pur.ts';

const PANNES = [
  /* La regle pure. */
  { nom: 'la question se repose apres une reponse', fichier: PUR, r: [['  if (aDejaRepondu(f)) return false;\n  if (f.archived === true) return false;', '  if (f.archived === true) return false;']] },
  { nom: 'une mineure par sa date repond elle-meme', fichier: PUR, r: [["  (f.segments ?? []).includes('Enfant') || mineureLe(f.birthday, jour);", "  (f.segments ?? []).includes('Enfant');"]] },
  { nom: 'la reponse ecrite est toujours oui', fichier: PUR, r: [['  return { oui, le: jour, par };', '  return { oui: true, le: jour, par };']] },
  { nom: 'un STOP se leve d un seul toucher', fichier: PUR, r: [["leveUnStop: !!n && n.par === 'stop' && oui === true", 'leveUnStop: false']] },
  { nom: 'le compte prend les fiches archivees', fichier: PUR, r: [['f.branchId !== o.branchId || f.archived === true || f.essai === true', 'f.branchId !== o.branchId || f.essai === true']] },
  { nom: 'la semaine commence le dimanche', fichier: PUR, r: [['d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));', 'd.setUTCDate(d.getUTCDate() - d.getUTCDay());']] },
  { nom: 'la question n est plus adressee', fichier: PUR, r: [['  return `${p}, ${question.charAt(0).toLowerCase()}${question.slice(1)}`;', '  return question;']] },
  /* La fonction. */
  { nom: 'l invitee repond pour elle', fichier: FN, r: [['  if (!porte || porte.parInvitee) return json({ error: \'lien_introuvable\' }, 404);\n  const d = porte.rdv.data ?? {};\n  if (d.status', '  if (!porte) return json({ error: \'lien_introuvable\' }, 404);\n  const d = porte.rdv.data ?? {};\n  if (d.status']] },
  { nom: 'la fonction ecrit par-dessus un STOP', fichier: FN, r: [
    ["    if (aDejaRepondu(f)) return json({ ok: true, deja: true });\n    const accord = accordAPoser(f, b.oui, jourDeCotonou(new Date()), 'reglement');", "    const accord = { oui: b.oui, le: jourDeCotonou(new Date()), par: 'reglement' as const };"]] },
  { nom: 'le jour UTC au lieu de Cotonou', fichier: FN, r: [["accordAPoser(f, b.oui, jourDeCotonou(new Date()), 'reglement')", "accordAPoser(f, b.oui, new Date().toISOString().slice(0, 10), 'reglement')"]] },
  { nom: 'l ecriture sans verrou', fichier: FN, r: [['    if (fiche.updated_at) q = q.eq(\'updated_at\', fiche.updated_at);\n    const { data: ecrites', '    const { data: ecrites']] },
  { nom: 'lire propose la question a l invitee', fichier: FN, r: [['  const accord = !parInvitee && await laQuestionDesNouvelles(r.clientId)', '  const accord = await laQuestionDesNouvelles(r.clientId)']] },
  { nom: 'la fonction redit la reponse deja la', fichier: FN, r: [['    if (aDejaRepondu(f)) return json({ ok: true, deja: true });', '    if (aDejaRepondu(f)) return json({ ok: true, deja: true, oui: f.nouvelles?.oui });']] },
  { nom: 'l action n est pas routee', fichier: FN, r: [["    if (b.action === 'nouvelles') return await nouvelles(req, b);\n", '']] },
  { nom: 'la version ne bouge pas', fichier: FN, r: [["const VERSION = '2026-11-26-b';", "const VERSION = '2026-11-26-a';"]] },
  { nom: 'la copie du bloc derive', fichier: FN, r: [["  if (f.archived === true) return false;\n  if (estUneTeteDEnfant(f, jour)) return false;\n  return true;\n}\n\n/** LA RÉPONSE", "  if (estUneTeteDEnfant(f, jour)) return false;\n  return true;\n}\n\n/** LA RÉPONSE"]] },
  { nom: 'pas de frein', fichier: FN, r: [["  if (!(await permis(ipOf(req), 'regler-nouvelles', 20))) return json({ error: 'trop' }, 429);\n", '']] },
  /* Les ecrans. */
  { nom: 'la question au TPE de poche', fichier: APP, r: [['{accordADemander && !auTpe() && !ecran.page.tetes', '{accordADemander && !ecran.page.tetes']] },
  { nom: 'la question pour l invitee', fichier: APP, r: [['!ecran.page.tetes && !ecran.page.parInvitee && <LesNouvelles', '!ecran.page.tetes && <LesNouvelles']] },
  { nom: 'la page oublie ce que dit la fonction', fichier: APP, r: [['    setAccordADemander(r.accordADemander === true);\n', '']] },
  { nom: 'oui passe devant non', fichier: NOUV, r: [['<button key={b.id} type="button" className="rg-autre" style={{ flex: 1 }}', '<button key={b.id} type="button" className={b.id === BOUTON_ACCORD_OUI ? \'rg-regler\' : \'rg-autre\'} style={{ flex: 1 }}']] },
  { nom: 'le comptoir sur l horloge du poste', fichier: CPT, r: [["ecrisLAccord(client.id, (f) => accordAPoser(f, oui, momentDuSalon().jour, 'comptoir'));\n    if (pose)", "ecrisLAccord(client.id, (f) => accordAPoser(f, oui, new Date().toISOString().slice(0, 10), 'comptoir'));\n    if (pose)"]] },
  { nom: 'la ligne sur un rendez-vous d un autre jour', fichier: CPT, r: [["if (rdv && (String(rdv.date).slice(0, 10) !== jour || rdv.status === 'annulé')) return null;", "if (rdv && rdv.status === 'annulé') return null;"]] },
  { nom: 'la fiche leve un STOP d un toucher', fichier: CPT, r: [['    if (c.leveUnStop && !stopLeve) { setLeverLeStop(true); return; }\n', '']] },
  { nom: 'la fiche du rendez-vous sans la ligne', fichier: SH, r: [['        {appt && <AccordAuComptoir client={rdvClient} rdv={appt} />}\n', '']] },
  { nom: 'C est regle sans la ligne', fichier: ACT, r: [['                <AccordAuComptoir client={clientDuRegle} />\n', '']] },
  { nom: 'la fiche cliente revient aux deux puces d avant', fichier: CUS, r: [['          <AccordSurLaFiche client={client} />', '          <div>Elle accepte</div>']] },
  { nom: 'la nouvelle fiche sur l horloge du poste', fichier: CUS, r: [["nouvelles: { oui: accordNouvelles, le: momentDuSalon().jour, par: 'comptoir' },", "nouvelles: { oui: accordNouvelles, le: todayISO(), par: 'comptoir' },"]] },
  { nom: 'Ma Couronne ecrit au nom du comptoir', fichier: COUR, r: [["accordAPoser(f, oui, momentDuSalon().jour, 'couronne')", "accordAPoser(f, oui, momentDuSalon().jour, 'comptoir')"]] },
  { nom: 'l accueil sans la carte', fichier: TABS, r: [['        <LesNouvellesDeLaMaison />\n', '']] },
  { nom: 'la question sans son anglais', fichier: EN, r: [["  'Souhaitez-vous aussi recevoir les nouvelles de la Maison : les envies de saison, les offres et les places qui se libèrent ? Deux messages par mois au plus, et STOP à tout moment.':\n    'Would you also like to receive news from the Maison: seasonal ideas, offers and newly opened slots? Two messages a month at most, and STOP at any time.',\n", '']] },
  { nom: 'le Tableau de bord sans la tuile', fichier: TDB, r: [['      <TuileDeLAccord />\n', '']] },
  { nom: 'le type de la fiche oublie reglement', fichier: AUD, r: [["'stop' | 'whatsapp' | 'reglement' };", "'stop' | 'whatsapp' };"]] },
];

const lisLF = (rel) => readFileSync(path.join(racine, rel), 'utf8').replace(/\r\n/g, '\n');
const applique = (panne) => {
  let t = lisLF(panne.fichier);
  for (const [avant, apres] of panne.r) {
    if (!t.includes(avant)) throw new Error(`panne introuvable : ${panne.nom} (${avant.slice(0, 60)})`);
    t = t.replace(avant, () => apres);
  }
  return t;
};

const lance = async (panne) => {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-l-accord-d-un-bouton-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    const texte = panne ? applique(panne) : null;
    const cible = panne ? path.normalize(path.join(racine, panne.fichier)) : null;
    /* La VRAIE fonction, transpilee sans son import d'esm.sh : le harnais la rejoue. */
    const source = (panne?.fichier === FN ? texte : lisLF(FN))
      .replace(/^import \{ createClient \} from 'https:\/\/esm\.sh\/@supabase\/supabase-js@2';$/m, '');
    const { code } = await transform(source, { loader: 'ts', format: 'cjs', target: 'es2022' });
    const fonction = path.join(dossier, 'regler-la-seance.cjs');
    writeFileSync(fonction, code);
    const greffon = {
      name: 'panne',
      setup(b) {
        if (!panne) return;
        b.onLoad({ filter: /\.(ts|tsx)$/ }, (args) => {
          if (path.normalize(args.path) !== cible) return undefined;
          return { contents: texte, loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts' };
        });
      },
    };
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-l-accord-d-un-bouton.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
      loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
      plugins: [greffon],
    });
    const env = { ...process.env, REG_FONCTION: fonction };
    delete env.ACCORD_PANNE_FICHIER;
    delete env.ACCORD_PANNE_COPIE;
    if (panne) {
      const copie = path.join(dossier, 'copie', panne.fichier);
      mkdirSync(path.dirname(copie), { recursive: true });
      writeFileSync(copie, texte);
      env.ACCORD_PANNE_FICHIER = panne.fichier;
      env.ACCORD_PANNE_COPIE = copie;
    }
    return spawnSync(process.execPath, [sortie], { cwd: racine, env, encoding: 'utf8' });
  } finally {
    setTimeout(() => rmSync(dossier, { recursive: true, force: true }), 0);
  }
};

const prouve = process.argv.includes('--prouve');
const net = await lance(null);
process.stdout.write(net.stdout);
if (net.status !== 0) { process.stderr.write(net.stderr); process.exit(1); }
if (prouve) {
  let muettes = 0;
  for (const p of PANNES) {
    const r = await lance(p);
    const epreuve = (r.stdout ?? '').split('\n').find((l) => l.startsWith('ECHEC'));
    const crie = r.status !== 0 && !!epreuve;
    if (!crie) muettes++;
    console.log(`${crie ? 'CRIE ' : 'MUETTE'} ${p.nom}${epreuve ? `  (${epreuve.slice(6).split(' -> ')[0].trim()})` : r.status !== 0 ? '  (le harnais tombe)' : ''}`);
  }
  if (muettes) { console.log(`\n${muettes} panne(s) muette(s) : le banc ne voit pas tout.`); process.exit(1); }
  console.log(`\nLes ${PANNES.length} pannes crient.`);
}
