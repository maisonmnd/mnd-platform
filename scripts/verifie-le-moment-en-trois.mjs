import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LE MOMENT EN TROIS VENUES, EPROUVE - 7 novembre 2026.
   « Le Moment se paie en 3 fois, il faut diviser le paiement en 3 venues »
   (Yeman). Le banc tient :
   - la regle pure (src/shared/le-moment-en-trois-pur.ts) : trois tiers arrondis
     au 500 F, le premier absorbe, somme exacte ; etats derives des reglements
     (imputes dans l'ordre) ; tiers non regle = pause, sans dette ; venue
     deplacee ou manquee garde son tiers ; un tiers ne se regle qu'une fois ;
   - jamais de remise ajoutee : forfait = tiers, piece d'une ligne ;
   - la cloture du jour ne compte que le tiers du jour ;
   - la fin et Ma Couronne (les VRAIES regles : porteAvantApres, aReglerApres,
     restesHorsFormuleDe) lisent le tiers comme un prix fige : jamais le total,
     jamais un tiers a venir, jamais trois fois ;
   - un seul message par venue, le prenom d'usage, les mots, les copies
     serveur, les 390 px.
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc doit
   crier a chacune. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

const PUR = 'src/shared/le-moment-en-trois-pur.ts';
const CHOIX = 'src/apps/trone/routes/clients/MomentEnTroisChoix.tsx';
const FICHE = 'src/apps/trone/routes/clients/MomentEnTroisFiche.tsx';
const CAISSE = 'src/apps/trone/routes/clients/actions.tsx';
const RDV = 'src/apps/trone/routes/clients/_shared.tsx';
const COURONNE = 'src/apps/couronne/MomentEnTrois.tsx';
const TER = 'supabase/functions/terminer-et-regler/index.ts';
const DETAIL = 'src/shared/le-moment-detail-pur.ts';
const SEANCES = 'src/shared/le-moment-seances-pur.ts';
const M194 = 'supabase/migrations/0194_le_moment_cuir_chevelu_quatre_venues.sql';
const M195 = 'supabase/migrations/0195_le_cas_reel_quatre_venues.sql';
const PANNES = [
  /* ── La regle pure ── */
  ['le tiers n est plus arrondi au 500 F', PUR, '  const part = Math.floor(t / n / ARRONDI_DU_TIERS_XOF) * ARRONDI_DU_TIERS_XOF;', '  const part = Math.floor(t / n);'],
  ['le premier tiers n absorbe plus l arrondi', PUR, '  return [t - part * (n - 1), ...Array.from({ length: n - 1 }, () => part)];', '  return [...Array.from({ length: n - 1 }, () => part), t - part * (n - 1)];'],
  ['la somme des tiers ne vaut plus le total', PUR, '  return [t - part * (n - 1), ...Array.from({ length: n - 1 }, () => part)];', '  return Array.from({ length: n }, () => part);'],
  ['un total trop petit se regle en trois', PUR, '  if (n < 2 || t < totalMinimumXof(n)) return null;', '  if (t < 0) return null;'],
  ['un tiers non regle ne met pas le Moment en pause', PUR, "    else if (e.dueIso < aujourdhui) { etat = 'en-pause'; prochaineVue = true; }", "    else if (false) { etat = 'en-pause'; prochaineVue = true; }"],
  ['la pause ajoute une dette', PUR, '    resteXof: resteDeLEcheancier(etats),', "    resteXof: resteDeLEcheancier(etats) + (lignes.some((l) => l.etat === 'en-pause') ? 5000 : 0),"],
  ['les versements ne s imputent plus dans l ordre', PUR, '  const etats = etatDesEcheances(echeancierDuPlan(ref, datesLues), verse, aujourdhui);', '  const etats = etatDesEcheances(echeancierDuPlan(ref, datesLues).reverse().map((e, i) => ({ ...e, numero: i + 1 })), verse, aujourdhui);'],
  ['une venue deplacee garde son ancienne date', PUR, "  const dates = rangs.map((k) => parRang.get(k)?.date ?? '');", "  const dates = rangs.map(() => rdvsDuPlanLus[0]?.date ?? '');"],
  ['un tiers se regle plus d une fois', PUR, '  return m ? Math.min(Math.max(0, argentDeLaVenue(r)), m.tiers[m.rang - 1] ?? 0) : 0;', '  return m ? Math.max(0, argentDeLaVenue(r)) : 0;'],
  ['la caisse propose le total au lieu du tiers', PUR, '  return m ? Math.max(0, (m.tiers[m.rang - 1] ?? 0) - regleDuTiers(r)) : 0;', '  return m ? Math.max(0, m.total - regleDuTiers(r)) : 0;'],
  ['le forfait du tiers porte une remise', PUR, '  return { nom: `Le Moment ${enNVenues(m.tiers.length)} · venue ${m.rang} sur ${m.tiers.length}`, totalXof: tiers, baseXof: tiers, poseAt: jourIso };', '  return { nom: `Le Moment ${enNVenues(m.tiers.length)} · venue ${m.rang} sur ${m.tiers.length}`, totalXof: tiers, baseXof: m.tiers.reduce((a, b) => a + b, 0), poseAt: jourIso };'],
  ['la venue d entretien du Moment n est plus la Signature', PUR, '.some((i) => i.serviceId === SINSIN_ESSENTIEL) ? VENUE_ESSENTIEL : VENUE_SIGNATURE;', '.some((i) => i.serviceId === SINSIN_ESSENTIEL) ? VENUE_SIGNATURE : VENUE_ESSENTIEL;'],
  ['un venue passee ne garde pas son tiers quand son rendez-vous est efface', PUR, "  const datesLues = dates.map((d, i) => d || dates.slice(0, i).reverse().find(Boolean) || dates.find(Boolean) || aujourdhui);", "  const datesLues = dates.map((d) => d || '2000-01-01');"],
  /* ── Quatre venues, prix convenu ── */
  ['un plan a quatre venues se lit a trois', PUR, '  const rangs = Array.from({ length: ref.tiers.length }, (_, i) => i + 1);', '  const rangs = [1, 2, 3];'],
  ['le nombre de venues ne suit plus le Moment', PUR, '  serviceId === SERVICE_LE_MOMENT_CUIR_CHEVELU ? VENUES_DU_MOMENT_CUIR_CHEVELU : VENUES_DU_MOMENT;', '  serviceId === SERVICE_LE_MOMENT_CUIR_CHEVELU ? VENUES_DU_MOMENT : VENUES_DU_MOMENT_CUIR_CHEVELU;'],
  ['les venues suivantes du cuir chevelu ne sont plus le Moment', PUR, '  momentId === SERVICE_LE_MOMENT_CUIR_CHEVELU ? momentId : venueDEntretienDuMoment(inclus);', '  venueDEntretienDuMoment(inclus);'],
  ['le total convenu est ramene a la grille', PUR, 'total: convenus ? tiers.reduce((s, x) => s + x, 0) : Math.round(total), tiers, ...(plafondXof', 'total: Math.round(total), tiers, ...(plafondXof'],
  ['une part convenue non multiple de 500 F est acceptee', PUR, '&& x >= ARRONDI_DU_TIERS_XOF && x % ARRONDI_DU_TIERS_XOF === 0)', '&& x >= ARRONDI_DU_TIERS_XOF)'],
  ['le bouton dit toujours le tiers', PUR, "(n === 3 ? 'le tiers' : n === 4 ? 'le quart' : 'la part');", "'le tiers';"],
  ['le comptoir propose quatre venues au Moment Signature', RDV, '  const nVenues = venuesDuMomentPour(serviceIds[0]);', '  const nVenues = 4;'],
  /* ── Les seances a venir se programment d office ── */
  ['le delai ne vient plus du catalogue', SEANCES, '      if (premiere) return premiere.afterWeeks as number;', '      if (premiere) return 99;'],
  ['un jour ferme garde sa date', SEANCES, '    const direct = bon(cible) && !o.ferme(cible) &&', '    const direct = bon(cible) &&'],
  ['une place prise est ignoree', SEANCES, ' && o.heuresLibres(cible).includes(o.heureVenue1) && heureValable(cible, o.heureVenue1);', ' && heureValable(cible, o.heureVenue1);'],
  ['le jour favori est ignore', SEANCES, '(favoris.has(jourDeLaSemaine(a)) ? 0 : 1) - (favoris.has(jourDeLaSemaine(b)) ? 0 : 1) ||', ''],
  ['le samedi s ouvre avant 9 h', SEANCES, '!(jourDeLaSemaine(iso) === 6 && minutes(t) < minutes(OUVERTURE_DU_SAMEDI));', 'true;'],
  ['la raison du deplacement se tait', SEANCES, '...(raison ? { raison } : {}) });', '});'],
  ['une venue passee se pose en silence', SEANCES, '    if (cible < o.aujourdhui) {', '    if (false) {'],
  ['un plan annule compte comme ouvert', SEANCES, "r.clientId === clientId && r.status !== 'annulé' && r.date >= aujourdhui", "r.clientId === clientId && r.date >= aujourdhui"],
  ['Comptant ne programme plus', RDV, '      if (programme && !enTrois) {', '      if (false) {'],
  ['une seance comptant se facture', RDV, "coveredBySub: true, coverKind: 'forfait', coverServiceId: serviceIds[0], priceXof: 0,", "coveredBySub: true, coverKind: 'forfait', coverServiceId: serviceIds[0], priceXof: 5000,"],
  ['les seances +8 et +12 semaines se posent en plus (doublon)', RDV, ' || momentAProgrammer) continue;', ') continue;'],
  ['un second plan se programme par-dessus', RDV, 'const momentAProgrammer = leMomentSeul && !forfaitPose && !planDejaOuvert;', 'const momentAProgrammer = leMomentSeul && !forfaitPose;'],
  ['une venue passee se pose en silence au comptoir', RDV, '      if (passee >= 0 || venuesActives.some((v) => v.date && v.date < aujourdhui)) {', '      if (false) {'],
  ['les jours favoris ne sont pas lus', RDV, 'joursPreferes: rdvClient ? joursDeLaTete(rdvClient) : [],', 'joursPreferes: [],'],
  /* ── Le detail, le plafond, les migrations ── */
  ['un service retire disparait du detail au lieu de se dire', DETAIL, "if (!s) return { serviceId: i.serviceId, nom: SERVICE_RETIRE_DIT, offert, retire: true, ...apres };", "if (!s) return { serviceId: i.serviceId, nom: '', offert, retire: true, ...apres };"],
  ['les offerts ne sont plus marques', DETAIL, '    const offert = i.offert === true;', '    const offert = false;'],
  ['le detail ignore la venue (tout partout)', DETAIL, '  const choisis = rang !== undefined && reparti ? inclus.filter((i) => (i.venue ?? 1) === rang) : inclus;', '  const choisis = inclus;'],
  ['le plafond n est plus tenu', PUR, '    Math.min(Math.max(ARRONDI_DU_TIERS_XOF, Math.floor(o.plafondXof / ARRONDI_DU_TIERS_XOF) * ARRONDI_DU_TIERS_XOF),', '    Math.min(1_000_000_000,'],
  ['la remise ne baisse plus les parts', PUR, 'arrondiAuCinqCents(prixApresRemisePct(t, o.remisePct ?? 0) - enFrancs)', 'arrondiAuCinqCents(prixApresRemisePct(t, 0) - enFrancs)'],
  ['une part peut tomber a zero', PUR, '  return grille.map((t) => Math.max(ARRONDI_DU_TIERS_XOF,', '  return grille.map((t) => Math.max(0,'],
  ['la fiche ne detaille plus les venues', FICHE, '<DetailDuMoment detail={detail} titre="Ce que comprend cette venue" replie avecValeurs={false} />', ''],
  ['la caisse ne liste plus les services de la venue', CAISSE, '          {appt.momentEnTrois && (\n            <DetailDuMoment', '          {false && (\n            <DetailDuMoment'],
  ['Ma Couronne montre la valeur des services', COURONNE, "                      {d.offert ? ` · ${t('Offert')}` : ''}", "                      {d.offert ? ` · ${t('Offert')}` : ''}{d.valeurXof ? prix(d.valeurXof, currency) : ''}"],
  ['la migration du cas reel laisse passer une facture', M195, "or nullif(x.data->>'invoiceId', '') is not null)", 'or false)'],
  ['la migration du cas reel ne refuse plus', M195, "raise exception '0195 : un des trois rendez-vous porte déjà", "raise notice '0195 : un des trois rendez-vous porte déjà"],
  ['la migration du cas reel remet 31 500 F', M195, "tiers jsonb := '[45000,45000,45000,45000]'::jsonb;", "tiers jsonb := '[31500,31500,31500,31500]'::jsonb;"],
  ['le catalogue perd une reprise', M194, '    {"serviceId": "sv-atl-ii-l", "afterWeeks": 8, "venue": 3},\n', ''],
  /* ── Le comptoir ── */
  ['le Moment cuir chevelu ne se regle plus en trois', PUR, '  (serviceIds ?? []).some((id) => LES_MOMENTS.includes(id));', '  (serviceIds ?? []).includes(SERVICE_LE_MOMENT);'],
  ['les seances +8 et +12 semaines se posent en plus des deux venues', RDV, '          if (!inc.afterWeeks || inc.afterWeeks <= 0 || momentAProgrammer) continue;', '          if (!inc.afterWeeks || inc.afterWeeks <= 0) continue;'],
  ['les dates ne se choisissent plus au depart', RDV, '      if (venuesActives.some((v) => !v.date || !v.time)) {', '      if (false) {'],
  ['les trois rendez-vous ne se posent plus ensemble', RDV, '      suites.push(...suitesDuMoment);\n', ''],
  ['les remises se cumulent au tiers', RDV, '          remisesLignes: undefined, codeOffre: undefined, offreId: undefined, horsOffreDuJour: true,\n', '          horsOffreDuJour: true,\n'],
  ['le premier rendez-vous garde le total comme prix', RDV, '          momentEnTrois: plan(1), forfait: forfaitDuTiers(plan(1), jour), priceXof: tiersDuMomentIci[0],', '          momentEnTrois: plan(1), forfait: forfaitDuTiers(plan(1), jour), priceXof: totalDuMoment,'],
  ['la venue d entretien est un autre geste', RDV, '            id: uid(), branchId: branch.id, clientId, serviceIds: [venueDEntretien],', '            id: uid(), branchId: branch.id, clientId, serviceIds: serviceIds,'],
  ['le choix 3 venues s offre a tout rendez-vous', RDV, '  const leMomentSeul = !appt && serviceIds.length === 1 && contientLeMoment(serviceIds) && !effCovered;', '  const leMomentSeul = !appt;'],
  ['l ecran pose n encaisse pas le premier tiers', RDV, '          {poseLe.momentEnTrois && onEncaisser && (', '          {false && (',],
  ['le bouton de la caisse dit le total', CAISSE, '                      ? phraseEncaisserLeTiers(appelDe(payerClient ?? client, appt.clientName), settleTotal, appt.momentEnTrois.tiers.length)', '                      ? `Encaisser ${fmtMoney(grossActuel, currency)}`'],
  ['la piece du tiers ventile sur les prix pleins', CAISSE, '        if (appt.momentEnTrois) return [ligneFacture(nomForfait || apptLabel(appt, byId), net)];\n', ''],
  ['la note « au lieu de » revient sur la piece du tiers', CAISSE, '        ? (appt.momentEnTrois ? nomForfait : `${nomForfait}', '        ? (false ? nomForfait : `${nomForfait}'],
  /* ── La fiche ── */
  ['la fiche ne propose pas le tiers du jour', FICHE, '            {aEncaisser > 0 && rdvDuJour && (', '            {false && ('],
  ['la fiche devine le prenom par split', FICHE, '  const appel = appelDe(client, undefined);', "  const appel = (client.name ?? '').split(' ')[0];"],
  ['la fiche force une largeur de 900 px', FICHE, "style={{ display: 'grid', gridTemplateColumns: '1fr auto'", "style={{ width: 900, display: 'grid', gridTemplateColumns: '1fr auto'"],
  /* ── Ma Couronne ── */
  ['la page recoit le montant au lieu de le relire', COURONNE, '                onClick={() => { void toucher.regle(rdv.id); }}', '                onClick={() => { void (toucher.regle as (a: string, b: number) => Promise<void>)(rdv.id, duBase); }}'],
  ['le bouton n attend plus la base', COURONNE, '            {cible && rdv && duBase !== null && (', '            {cible && rdv && ('],
  ['le jour de la venue, le bouton double « Terminer et regler »', COURONNE, "        const duBase = rdv && quand && quand !== 'jour-meme'", '        const duBase = rdv && quand'],
  ['Ma Couronne dit « retard »', COURONNE, "l.etat === 'en-pause' ? t('En pause')", "l.etat === 'en-pause' ? t('En retard')"],
  /* ── La copie serveur ── */
  ['la copie de terminer-et-regler derive de son original', TER, '  if (a.forfait) return Math.max(0, Math.round(Number(a.forfait.totalXof) || 0));', '  if (a.forfait) return Math.max(0, Math.round(Number(a.forfait.totalXof) || 0)) + 1;'],
];

const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');
const fichiersDe = (f) => (Array.isArray(f) ? f : [f]);

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', `verifie-le-moment-en-trois-${process.pid}`);
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-le-moment-en-trois.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error', loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', BASE_URL: '/' }) },
      /* Les magasins de la Maison (agenda, finance) lisent le navigateur a leur import : un navigateur de poche. */
      banner: {
        js: `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, dispatchEvent() {}, location: { href: '' } };
globalThis.document = { body: { dataset: {} }, addEventListener() {} };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`,
      },
    });
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8', env: { ...process.env } });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

if (prouve) {
  const propre = spawnSync(process.execPath, [import.meta.filename], { encoding: 'utf8' });
  if (propre.status !== 0) { console.log('Le banc ne passe pas sur le code propre :'); console.log(propre.stdout, propre.stderr); process.exit(1); }
  const fichiers = [...new Set(PANNES.flatMap((x) => fichiersDe(x[1])))];
  const gardes = new Map(fichiers.map((f) => [f, readFileSync(path.join(racine, f))]));
  const avant = new Map(fichiers.map((f) => [f, md5(f)]));
  let muettes = 0;
  try {
    for (const [nom, cible, a, b] of PANNES) {
      const touches = fichiersDe(cible);
      const introuvables = touches.filter((f) => !gardes.get(f).toString('utf8').replace(/\r\n/g, '\n').includes(a));
      if (introuvables.length) { console.log(`INTROUVABLE ${nom} (${introuvables.join(', ')})`); muettes++; continue; }
      for (const f of touches) {
        const brut = gardes.get(f).toString('utf8');
        const crlf = brut.includes('\r\n');
        const casse = brut.replace(/\r\n/g, '\n').replace(a, () => b);
        writeFileSync(path.join(racine, f), crlf ? casse.replace(/\n/g, '\r\n') : casse);
      }
      try {
        const r = spawnSync(process.execPath, [import.meta.filename], { encoding: 'utf8' });
        if (r.status === 0) { console.log(`MUETTE ${nom}`); muettes++; } else console.log(`CRIE  ${nom}`);
      } finally {
        for (const f of touches) writeFileSync(path.join(racine, f), gardes.get(f));
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

process.chdir(racine);
const r = await lanceLeBanc();
process.stdout.write(r.stdout ?? '');
if (r.stderr) process.stdout.write(r.stderr);
process.exit(r.status ?? 1);
