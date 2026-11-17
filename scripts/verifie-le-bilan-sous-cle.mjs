import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LA VISIO LIMITEE, DEPLACEE, ET LE BILAN SOUS CLE, EPROUVES - 17 novembre 2026
   (« La consultation en affiches », le cote serveur ; sur le modele de
   verifie-le-rendez-vous-suggere).
   `node scripts/verifie-le-bilan-sous-cle.mjs` : le banc, dans un processus
   fils. La fonction visio-salle y est REGROUPEE depuis les sources du moment
   (scripts/serveur/visio-salle.ts), puis tourne contre une base simulee.
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc
   doit crier a chacune. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-le-bilan-sous-cle');
  mkdirSync(dossier, { recursive: true });
  try {
    const fonction = path.join(dossier, 'visio-salle.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/serveur/visio-salle.ts')],
      bundle: true, format: 'esm', platform: 'neutral', target: 'es2022', outfile: fonction,
      external: ['npm:*'], charset: 'utf8', legalComments: 'none', logLevel: 'error', mainFields: ['module', 'main'],
    });
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-le-bilan-sous-cle.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error', external: ['esbuild'],
      loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
    });
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8', env: { ...process.env, VISIO_FONCTION: fonction } });
  } catch (e) {
    /* Une faute qui casse la compilation crie aussi. */
    return { status: 1, stdout: '', stderr: String(e?.message ?? e) };
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const PUR = 'src/shared/visio-pur.ts';
const FN = 'scripts/serveur/visio-salle.ts';
const PRIVEE = 'src/shared/consultation-privee-pur.ts';
const DEPOT = 'src/shared/depot-de-la-consultation-pur.ts';
const PUSH = 'supabase/functions/push-notify/index.ts';
const LECTURE = 'src/shared/lecture-de-la-maison-pur.ts';
const SALLE = 'src/apps/couronne/SalleDeVisio.tsx';
const FILE_B = 'src/apps/trone/routes/clients/ConsultationsVisios.tsx';
const SQL = 'supabase/migrations/0216_la_visio_limitee_et_deplacee.sql';
const PANNES = [
  // la limite des 90 jours
  ['une visio manquee ne compte plus', PUR, "  v.statut !== 'annulée' || !annuleeATemps(v, r.changementAvantMin);", "  v.statut === 'réservée' || v.statut === 'tenue';"],
  ['la limite n a plus de periode : une visio d il y a un an ferme encore la porte', PUR, '    .filter((v) => comptePourLaLimite(v, r) && Date.parse(v.debut) > depuis)', '    .filter((v) => comptePourLaLimite(v, r))'],
  ['une visio annulee a temps compte quand meme', PUR, '  return le <= Date.parse(v.debut) - avantMin * 60_000;', '  return false;'],
  ['une visio annulee trop tard ne compte plus', PUR, '  return le <= Date.parse(v.debut) - avantMin * 60_000;', '  return true;'],
  ['une visio annulee par la Maison compte contre elle', PUR, "  if (v.annuleePar === 'maison') return true;\n", ''],
  ['la porte rouvre le jour meme de la visio', PUR, 'jourDeCotonou(comptees[r.parTelephone - 1] + r.limiteJours * UN_JOUR_MS)', 'jourDeCotonou(comptees[r.parTelephone - 1])'],
  ['la periode passe a 30 jours', PUR, '  limiteJours: 90,\n', '  limiteJours: 30,\n'],
  ['la fonction oublie la limite', FN, '      if (!limite.ok) {', '      if (false) {'],
  ['la limite ne dit plus son jour', FN, "raison: 'limite', prochaineLe: limite.prochaineLe }, 409);", "raison: 'limite' }, 409);"],
  // les deux heures, les deux fois
  ['changer l heure reste permis a 1 h 59', PUR, "  if (maintenantMs > debutMs - r.changementAvantMin * 60_000) return 'trop-tard';\n", ''],
  ['2 heures pile devient trop tard', PUR, "  if (maintenantMs > debutMs - r.changementAvantMin * 60_000) return 'trop-tard';", "  if (maintenantMs >= debutMs - r.changementAvantMin * 60_000) return 'trop-tard';"],
  ['une troisieme fois passe', PUR, "  if ((v.deplacements ?? 0) >= r.changementsMax) return 'trop-de-fois';\n", ''],
  ['les deux fois deviennent trois', PUR, '  changementsMax: 2,\n', '  changementsMax: 3,\n'],
  ['le delai passe a une heure', PUR, '  changementAvantMin: 120,\n', '  changementAvantMin: 60,\n'],
  ['la fonction ne compte pas le changement', FN, '      const deplacements = (l.deplacements ?? 0) + (parLaMaison ? 0 : 1);', '      const deplacements = (l.deplacements ?? 0);'],
  ['un deplacement par la Maison compte contre elle', FN, '      const deplacements = (l.deplacements ?? 0) + (parLaMaison ? 0 : 1);', '      const deplacements = (l.deplacements ?? 0) + 1;'],
  ['la Maison deplace sans session', FN, "        if (!(await delEquipe(sb, req))) return json({ ok: false, motif: 'reserve-a-l-equipe' }, 403);\n        l = await parLId(sb, corps.id);", '        l = await parLId(sb, corps.id);'],
  ['la visio se deplace hors de la grille', FN, "      if (!creneauDuChangement(r, maintenant, await prisDepuis(sb, new Date(maintenant).toISOString()), debutIso, parLaMaison)) return json({ ok: false, motif: 'pris' }, 409);\n", ''],
  ['la visio deplacee garde sa salle d avant', FN, 'deplacee_de: l.debut, salle: null, salle_url: null, maj_le: le,', 'deplacee_de: l.debut, maj_le: le,'],
  ['la nouvelle heure ne part plus sur WhatsApp', FN, "      const whatsapp = await confirmeSurWhatsApp(sb, req, {\n        id: l.id, nom: l.nom, telephone: l.telephone, debut: debutIso, chemin: cheminDeLaSalle(l.id, jetonDuLien), branchId: l.branch_id ?? null, envoiId,\n      }).catch(() => 'erreur');", "      const whatsapp = 'en-attente';"],
  ['l ancien message de la visio part quand meme', FN, "      await retireDeLaSalle(sb, l.id, 'visio déplacée');\n", ''],
  // le lien par WhatsApp seulement, le billet
  ['la reservation rend le lien d entree', FN, 'ok: true, id, debut: debutIso, fin: finDe(debutIso), whatsapp, parWhatsApp: parti(whatsapp),', 'ok: true, id, jeton, debut: debutIso, fin: finDe(debutIso), whatsapp, parWhatsApp: parti(whatsapp),'],
  ['le billet est le lien d entree', FN, "...(sansBillet ? {} : { billet, chemin: cheminDeLaSalle(id, billet) }),", "...(sansBillet ? {} : { billet: jeton, chemin: cheminDeLaSalle(id, jeton) }),"],
  ['le billet ouvre la salle', FN, "      if (porte !== 'entree') return json({ ok: false, motif: 'par-whatsapp' }, 403);\n", ''],
  ['un numero sans WhatsApp reserve une visio', FN, "      if (numeroWa(telephone).length < 11) return json({ ok: false, motif: 'numero', raison: 'numero' }, 400);\n", ''],
  ['une annulation tardive ne se dit plus', FN, '        return json({ ok: true, compte: maintenant > Date.parse(l.debut) - r.changementAvantMin * 60_000 });', '        return json({ ok: true, compte: false });'],
  // le bilan sous cle
  ['le resume sort avant la fin de la visio', FN, '        const resume = fermee ? resumeSur(l.resume) : null;', '        const resume = resumeSur(l.resume);'],
  ['le WhatsApp de la suite part alors qu elle l a vue', FN, "        const retires = await retireDeLaSalle(sb, l.id, 'vue sur sa page', (id) => !id.startsWith(`env-${l.id}-wa-suite`));", '        const retires = 0;'],
  ['la suite se depose sans session de l equipe', FN, "    if (geste === 'suite') {\n      if (!(await delEquipe(sb, req))) return json({ ok: false, motif: 'reserve-a-l-equipe' }, 403);", "    if (geste === 'suite') {"],
  ['le WhatsApp de la suite part avant la fin de la visio', FN, '      const pasAvantMs = Date.parse(l.fin);', '      const pasAvantMs = 0;'],
  ['la privee s affiche avec un rituel des l intensive', PUR, '  if (r.rituel && !priveeObligatoire(r.niveau)) {', '  if (r.rituel) {'],
  ['sans locks, l affiche parle encore de locks', PUR, "      ligne: sansLocks ? 'À la Maison, devant vos cheveux' : 'À la Maison, devant vos locks',", "      ligne: 'À la Maison, devant vos locks',"],
  ['sans locks, les francs se deduisent encore du rituel', PUR, "      unite: sansLocks ? 'déduits de votre création' : 'déduits de votre rituel',", "      unite: 'déduits de votre rituel',"],
  ['« Je ne sais pas » se remet tel quel', PUR, "/^je ne sais pas\\.?$/i.test(String(texte ?? '').trim()) ? A_VOIR_AVEC_LA_MAISON", "false ? A_VOIR_AVEC_LA_MAISON"],
  ['le mot de la Maison ne passe plus par pourLeBilan', SALLE, '<dd>{t(pourLeBilan(r.mot))}</dd>', '<dd>{r.mot}</dd>'],
  ['le WhatsApp de la privee ne suit plus son parcours', FN, "        const ou = affiches.privee.ligne.charAt(0).toLowerCase() + affiches.privee.ligne.slice(1);", "        const ou = 'à la Maison, devant vos locks';"],
  ['le rituel propose mene a une reservation vide', PUR, 'jetonDuLien({ besoin: r.besoin, gestes: r.serviceIds })', 'jetonDuLien({ besoin: r.besoin, gestes: [] })'],
  // la consultation privee au Carnet
  ['la privee se pose sans etre reglee', FN, "  if (regle + 1 < prixDeLaPrivee()) return { status: 402, corps: { ok: false, motif: 'a-regler' } };\n", ''],
  ['la privee se pose hors de l agenda (08:00)', PRIVEE, "  if (!maitres || maitres.length === 0) return { ok: false, erreur: 'creneau_pris' };\n  return { ok: true, maitres };", "  return { ok: true, maitres: maitres ?? ['Team', 'Expert'] };"],
  ['la privee se pose le jour meme', PRIVEE, '  if (recevable) return { ok: false, erreur: recevable };\n', ''],
  ['la privee se pose un jour ferme', PRIVEE, "  if (ouvertureDuJour(m.jour, agenda.semaine, agenda.exceptions).closed) return { ok: false, erreur: 'creneau_ferme' };\n  const maitres = heuresDuJour(agenda, m.jour, dureeMin).get(m.heure);", "  const maitres = heuresDuJour(agenda, m.jour, dureeMin).get(m.heure) ?? (ouvertureDuJour(m.jour, agenda.semaine, agenda.exceptions).closed ? ['Team'] : undefined);"],
  ['la privee ignore les fauteuils', PRIVEE, 'capSimultane: agenda.sieges, maintenantMin: null,', 'capSimultane: 0, maintenantMin: null,'],
  ['la privee porte un acompte', PRIVEE, "    status: 'confirmé',\n    source: 'consultation',", "    status: 'confirmé', depositXof: 15000,\n    source: 'consultation',"],
  ['la privee rejouee fait un second rendez-vous', PRIVEE, 'export const idDuRdvDeLaPrivee = (consultationId: string): string => `rdv-privee-${consultationId}`;', 'export const idDuRdvDeLaPrivee = (consultationId: string): string => `rdv-privee-${consultationId}-${Date.now()}-${Math.random()}`;'],
  ['la consultation ne recoit pas son rdvId', FN, '      ...reste, rdvId: pris, rdv: {', '      ...reste, rdv: {'],
  ['une visio prend une place au Carnet sans que la Maison l ait choisi', PUR, '  auCarnet: false,\n', '  auCarnet: true,\n'],
  // le depot garde par le serveur
  ['le depot garde l estimation du navigateur', DEPOT, "  'estimation', 'fourchette', 'fourchettes',", "  'fourchette', 'fourchettes',"],
  ['le depot garde les points', DEPOT, "  'points', 'palier', 'paliers',", "  'palier', 'paliers',"],
  ['le depot garde l identifiant du navigateur', DEPOT, "  'id', 'createdAt', 'status', 'paidXof',", "  'createdAt', 'status', 'paidXof',"],
  ['le depot garde un reglement annonce', DEPOT, "  'id', 'createdAt', 'status', 'paidXof',", "  'id', 'createdAt', 'status',"],
  ['le depot ne retire les calculs qu en surface', DEPOT, '      const propre = sansLesCalculs(x, profondeur + 1);', '      const propre = x;'],
  ['un depot sans numero passe', DEPOT, "  if (phone.replace(/\\D/g, '').length < 8) return { ok: false, erreur: 'incomplet' };\n", ''],
  ['push-notify garde l identifiant du navigateur', PUSH, 'const id = equipe && idPresente ? idPresente : idDeConsultation(', 'const id = idPresente ? idPresente : idDeConsultation('],
  ['push-notify ecrase une consultation', PUSH, "    const { error } = await admin.from('consultations_queue').insert({\n      id,", "    const { error } = await admin.from('consultations_queue').upsert({\n      id,"],
  ['push-notify ne nettoie plus le depot', PUSH, '    const propre = depotPropre(c.data, { parLEquipe: equipe });', '    const propre = { ok: true as const, data: c.data as Record<string, unknown> };'],
  ['la copie de la regle dans push-notify derive', PUSH, "export const DEPOT_AU_PLUS = 20_000;", "export const DEPOT_AU_PLUS = 200_000;"],
  ['la lecture du Trone garde une prestation archivee', LECTURE, '  for (const s of services) if (proposableEnLigne(s) && !fermees.has(String(s.categoryId ?? \'\'))) vendues.set(s.id, s);', '  for (const s of services) vendues.set(s.id, s);'],
  // les ecrans
  ['la page propose « Changer l heure » sans que la fonction le permette', SALLE, '{c.permis && !annuler && <button type="button" className={`mv-bouton ${etat.billet ? \'\' : \'mv-bouton--lien\'}`}', '{!annuler && <button type="button" className={`mv-bouton ${etat.billet ? \'\' : \'mv-bouton--lien\'}`}'],
  ['revenir sans valider dit « Heure changée »', SALLE, 'onGarde={() => setChange(false)}', "onGarde={() => { setChange(false); setDit(t('Heure changée.')); }}"],
  ['la page choisit elle-meme les mots de l affiche', SALLE, 'ligne={t(affiches.privee.ligne)}', "ligne={t('À la Maison, devant vos locks')}"],
  ['un prix peut se couper sur deux lignes', SALLE, '<span className="mv-prix">{chiffre}</span>', '{chiffre}'],
  ['le prenom se coupe encore a la lettre s', FILE_B, "const prenomDe = (nom: string): string => nom.trim().split(/\\s+/)[0] ?? '';", "const prenomDe = (nom: string): string => nom.trim().split(/s+/)[0] ?? '';"],
  ['la file B ne dit plus qu un lien reste a envoyer', FILE_B, "v.lienEtat === 'a-envoyer' && ", "v.lienEtat === 'jamais' && "],
  ['0216 oublie l heure de l annulation', SQL, "    new.annulee_le := now();\n", ''],
];

const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');

if (!prouve) {
  const r = await lanceLeBanc();
  process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
  process.exitCode = r.status ?? 1;
} else {
  const propre = await lanceLeBanc();
  if (propre.status !== 0) { console.log('Le banc ne passe pas sur le code propre :'); console.log(propre.stdout); console.log(propre.stderr); process.exit(1); }
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
  console.log(`\n${PANNES.length - muettes}/${PANNES.length} pannes criees${intacts ? ', fichiers restaures a l identique' : ', FICHIERS ALTERES'}.`);
  process.exitCode = muettes || !intacts ? 1 : 0;
}
