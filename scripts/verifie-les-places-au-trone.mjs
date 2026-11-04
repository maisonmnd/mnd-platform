import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LES PLACES LIMITEES AU TRONE, EPROUVEES (4 novembre 2026).
   `node scripts/verifie-les-places-au-trone.mjs` lance le harnais ;
   `--prouve` le relance sur chaque panne ci-dessous, et chaque panne doit le
   faire crier. Les pannes vivent dans la memoire du bundle (un greffon
   d'esbuild remplace le texte lu) et dans la lecture des sources par le
   harnais (`__PANNE__`), jamais dans le depot : l'empreinte de chaque
   fichier est comparee avant et apres. Une panne dont le texte ne se trouve
   plus exactement une fois fait echouer la preuve : elle ne prouverait rien. */

const racine = path.resolve(import.meta.dirname, '..');
const P = 'src/apps/trone/routes/clients/places-au-trone-pur.ts';
const PP = 'src/apps/trone/routes/systeme/parametres-pur.ts';
const S = 'src/apps/trone/routes/clients/_shared.tsx';
const C = 'src/apps/trone/routes/vente/Caisse.tsx';
const B = 'src/apps/trone/routes/vente/SonProchainRituel.tsx';
const F = 'src/apps/trone/routes/clients/RdvFoyer.tsx';
const A = 'src/apps/trone/routes/clients/actions.tsx';
const PR = 'src/apps/trone/routes/systeme/Parametres.tsx';
const K = 'src/apps/trone/routes/systeme/CartePlacesLimitees.tsx';
const U = 'src/apps/trone/routes/clients/Customers.tsx';

const PANNES = [
  /* Les regles du Trone. */
  { nom: 'le relu au plein tarif rouvre le jour', fichier: P,
    avant: 'saufId: tenue ? e.relu?.id : undefined', apres: 'saufId: e.relu?.id' },
  { nom: 'une place prise se perd au Trone', fichier: P,
    avant: '      const tenue = placeTenue(relu, date, [o]);', apres: '      const tenue = undefined;' },
  { nom: 'la place suit un rendez-vous deplace', fichier: P,
    avant: "  if (String(rdv.date ?? '').slice(0, 10) !== String(dateIso).slice(0, 10)) return undefined;", apres: '' },
  { nom: 'les tickets de passage ne comptent pas', fichier: P,
    avant: 'return e.pieces ? { ...occ, prises: occ.prises + prisesAuComptoir(offre, e.pieces, dateIso, e.branchId) } : occ;', apres: 'return occ;' },
  { nom: 'un ticket d un autre jour compte', fichier: P,
    avant: "    && String(p.date ?? '').slice(0, 10) === dateIso\n", apres: '\n' },
  { nom: 'un devis compte', fichier: P,
    avant: "p.kind !== 'devis'", apres: 'true' },
  { nom: 'le bandeau ne dit pas la place tenue', fichier: P,
    avant: '  if (j.tenue) return `${titre} · place tenue`;\n', apres: '' },
  { nom: 'la plus faible retenue', fichier: P,
    avant: 'if (j && (!mieux || (j.offre.discountPct ?? 0) > (mieux.offre.discountPct ?? 0))) mieux = j;', apres: 'if (j && (!mieux || (j.offre.discountPct ?? 0) < (mieux.offre.discountPct ?? 0))) mieux = j;' },
  { nom: 'le compte d une offre sert a l autre', fichier: P,
    avant: 'const occupation = occupationPourLeRdv(o, rdvs, date,', apres: 'const occupation = occupationPourLeRdv(offres[0], rdvs, date,' },
  { nom: 'la famille par-dessus un geste offert', fichier: P,
    avant: 't.gesteAuPanier ? 0 : remiseFamilleDeLaTete(pctDuCompte, t);', apres: 'remiseFamilleDeLaTete(pctDuCompte, t);' },
  { nom: 'la famille sur le Rituel Sowa', fichier: P,
    avant: '(l.forfait || l.sansRemise ? 0 :', apres: '(l.forfait ? 0 :' },
  { nom: 'la famille suit une tete aux prix convenus', fichier: P,
    avant: '!t.prixConvenus && !t.abonnee', apres: '!t.abonnee' },
  { nom: 'la place passe pour une remise de la main quand le pourcentage change', fichier: P,
    avant: 'return seules.map((r, i) => (r && !r.xof && (r.pct ?? 0) > 0 && couvre.has(rdv.serviceIds[i]) ? null : r));', apres: 'return seules;' },
  { nom: 'pourquoi tait les prix convenus', fichier: P,
    avant: "  if (v.prixConvenus) return non('ses prix convenus s’appliquent (une seule remise)');\n", apres: '' },
  { nom: 'le reglage ne borne pas les places', fichier: P,
    avant: 'places: borne(changes.places ?? lu.places, BORNES_DES_PLACES.places, DEFAUTS_DES_PLACES.places),', apres: 'places: changes.places ?? lu.places,' },
  { nom: 'le reglage allume dans le dos de la direction', fichier: P,
    avant: 'active: changes.active ?? lu.active,', apres: 'active: changes.active ?? true,' },
  { nom: 'le reglage oublie les gestes du mercredi', fichier: P,
    avant: 'serviceIds: [...(mercredi?.serviceIds ?? [])],', apres: 'serviceIds: [],' },
  { nom: 'le code change avec le pourcentage', fichier: P,
    avant: '    deal: `−${r.pct} %`,\n', apres: '    deal: `−${r.pct} %`,\n    code: `PLACES${r.pct}`,\n' },
  { nom: 'le samedi coche par defaut', fichier: P,
    avant: "jours: ['Mar', 'Mer', 'Jeu', 'Ven'], places: 3", apres: "jours: ['Mar', 'Mer', 'Jeu', 'Ven', 'Sam'], places: 3" },
  { nom: 'les jours dans le desordre', fichier: P,
    avant: 'JOURS_DES_OFFRES.filter((j) => (JOURS_REGLABLES as readonly string[]).includes(j) && jours.includes(j));',
    apres: '[...jours].filter((j) => (JOURS_REGLABLES as readonly string[]).includes(j));' },
  { nom: 'le lundi se coche', fichier: P,
    avant: 'JOURS_DES_OFFRES.filter((j) => (JOURS_REGLABLES as readonly string[]).includes(j) && jours.includes(j));',
    apres: 'JOURS_DES_OFFRES.filter((j) => jours.includes(j));' },
  { nom: 'la tuile dit allumee quand elle est eteinte', fichier: PP,
    avant: "  if (!r.active) return { dit, etat: { ton: 'neutre', dit: 'éteinte' } };\n", apres: '' },
  { nom: 'la tuile ne groupe pas mar. au ven.', fichier: PP,
    avant: 'if (suites.length === 1 && suites[0].length >= 3) {', apres: 'if (false) {' },

  /* La fenetre du rendez-vous. */
  { nom: 'la fenetre ne compte pas le carnet', fichier: S,
    avant: '    rdvs: tousLesRdv,\n    relu: appt ?? null,', apres: '    rdvs: [],\n    relu: appt ?? null,' },
  { nom: 'la fenetre perd la place tenue', fichier: S,
    avant: '    rdvs: tousLesRdv,\n    relu: appt ?? null,', apres: '    rdvs: tousLesRdv,\n    relu: null,' },
  { nom: 'la fenetre oublie les prix convenus', fichier: S,
    avant: 'prixConvenus: prixConvenusDeLaTete,\n    autreRemise: autreRemiseIci,', apres: 'prixConvenus: false,\n    autreRemise: autreRemiseIci,' },
  { nom: 'la famille et la place cumulees dans la fenetre', fichier: S,
    avant: 'const autreRemiseIci = famPctCompte > 0 || gesteAuPanier ||', apres: 'const autreRemiseIci = gesteAuPanier ||' },
  { nom: 'la remise de ligne et la place cumulees dans la fenetre', fichier: S,
    avant: '\n    || remisesALaMain.some((r) => (r?.pct ?? 0) > 0 || (r?.xof ?? 0) > 0);', apres: ';' },
  { nom: 'une abonnee prend une place dans la fenetre', fichier: S,
    avant: 'couvertParAbonnement: couvertIci || abonneeALaDate,', apres: 'couvertParAbonnement: couvertIci,' },
  { nom: 'la famille par-dessus les prix convenus dans la fenetre', fichier: S,
    avant: 'const famPctCompte = famPctDeLaTete(famPctDuFoyer, { prixConvenus: prixConvenusDeLaTete, abonnee: abonneeALaDate });', apres: 'const famPctCompte = famPctDuFoyer;' },
  { nom: 'la famille sur le Rituel Sowa dans la fenetre', fichier: S,
    avant: ".filter((sv) => regimeTarifaire(sv, cats).k === 'forfait' || gesteSansRemise(sv))", apres: ".filter((sv) => regimeTarifaire(sv, cats).k === 'forfait')" },
  { nom: 'le Rituel Sowa prend la place dans la fenetre', fichier: S,
    avant: 'prixFerme(sv, pricing) && !gesteSansRemise(sv) };', apres: 'prixFerme(sv, pricing) };' },
  { nom: 'le panier tait la place', fichier: S,
    avant: '{!sansPrix && !effCovered && !estSuite && placeDite && retireParLaPlace > 0 && (', apres: '{false && (' },
  { nom: 'les compagnes prennent la famille de la tete', fichier: S,
    avant: 'famPct: famPctIci, ctx: ctxDuTarif', apres: 'famPct: famPctCompte, ctx: ctxDuTarif' },
  { nom: 'la plus forte des deux revient dans la fenetre', fichier: S,
    avant: '  const discountPct = discountPctSaisi;\n', apres: '  const discountPct = laPlusForteDesDeux ? discountPctSaisi : 0;\n' },
  { nom: 'la fenetre reprend les lignes de la place pour la main', fichier: S,
    avant: 'remisesDeLaMainDuRdv(appt, offresDeLaMaison)', apres: 'remisesDeLaMainSeules(appt, offresDeLaMaison)' },

  /* La Caisse. */
  { nom: 'la Caisse ne compte pas les tickets de passage', fichier: C,
    avant: '    relu: rituelDuTicket ?? null,\n    pieces: invoices,', apres: '    relu: rituelDuTicket ?? null,' },
  { nom: 'la Caisse ne compte pas le carnet', fichier: C,
    avant: '    rdvs: carnet,\n    relu: rituelDuTicket ?? null,', apres: '    rdvs: [],\n    relu: rituelDuTicket ?? null,' },
  { nom: 'la famille et la place cumulees a la Caisse', fichier: C,
    avant: 'const autreRemiseDuTicket = familleDuTicketPct > 0 || globalDisc', apres: 'const autreRemiseDuTicket = globalDisc' },
  { nom: 'la Caisse oublie les prix convenus', fichier: C,
    avant: 'prixConvenus: prixConvenusDuTicket,\n    autreRemise: autreRemiseDuTicket,', apres: 'prixConvenus: false,\n    autreRemise: autreRemiseDuTicket,' },
  { nom: 'une abonnee prend une place a la Caisse', fichier: C,
    avant: '|| (rituelDuTicket?.seriesIndex ?? 1) > 1 || abonneeDuTicket,', apres: '|| (rituelDuTicket?.seriesIndex ?? 1) > 1,' },
  { nom: 'la remise du ticket et la place cumulees', fichier: C,
    avant: 'familleDuTicketPct > 0 || globalDisc > 0 || globalDiscXof > 0 || remiseDuRituelXof > 0', apres: 'familleDuTicketPct > 0' },
  { nom: 'la Caisse prend le code des places tape a la main', fichier: C,
    avant: 'const offreCodee = !codeNominatif && !codeAPlacesTape ? offreDuCode(', apres: 'const offreCodee = !codeNominatif ? offreDuCode(' },
  { nom: 'la Caisse tait le decompte', fichier: C,
    avant: '`${ditLaPlaceDuRdv(jugeDuTicket)} · −', apres: '`${offreDuMercredi.title} · −' },

  /* Son prochain rituel. */
  { nom: 'le prochain rituel cumule famille et place', fichier: B,
    avant: 'autreRemise: famPctA(iso) > 0 || tarif.gesteAuPanier,', apres: 'autreRemise: false,' },
  { nom: 'le prochain rituel oublie les prix convenus', fichier: B,
    avant: '      prixConvenus,\n      autreRemise:', apres: '      autreRemise:' },
  { nom: 'le prochain rituel pose sur un carnet vieilli', fichier: B,
    avant: 'leMercrediDeLaPlace(p.iso, appointmentsStore.get())', apres: 'leMercrediDeLaPlace(p.iso)' },
  { nom: 'le prochain rituel : la famille d une tete aux prix convenus', fichier: B,
    avant: 'famPctDeLaTete(famPctDuFoyer, { prixConvenus, abonnee: !!contratPourLaDate(subs, clientId, iso, plans) })', apres: 'famPctDuFoyer' },
  { nom: 'la place du prochain rituel sans decompte', fichier: B,
    avant: '{`${mercredi.phrase} · −${mercredi.offre.discountPct ?? 0} %`}', apres: '{`${mercredi.offre.title} · −${mercredi.offre.discountPct ?? 0} %`}' },

  /* Le foyer, la reprise. */
  { nom: 'le foyer : la famille d une tete aux prix convenus', fichier: F,
    avant: 'prixConvenus: aUnPrixConvenu(l.tete),', apres: 'prixConvenus: false,' },
  { nom: 'le foyer : la famille sur le Rituel Sowa', fichier: F,
    avant: "(regimeTarifaire(sv).k === 'forfait' || gesteSansRemise(sv))", apres: "regimeTarifaire(sv).k === 'forfait'" },
  { nom: 'la reprise garde la place', fichier: A,
    avant: '    ...sansLaPlaceDuJour(appt),\n    ...laFamilleQuiSuitLaTete(appt, date),', apres: '    ...laFamilleQuiSuitLaTete(appt, date),' },
  { nom: 'la famille suit une tete aux prix convenus a la reprise', fichier: A,
    avant: '...laFamilleQuiSuitLaTete(appt, date),', apres: '...remiseFamilleQuiSuit(appt),' },
  { nom: 'la visite reprogrammee garde la place', fichier: A,
    avant: '        ...sansLaPlaceDuJour(appt),\n        ...laFamilleQuiSuitLaTete(appt, nextDate),', apres: '        ...laFamilleQuiSuitLaTete(appt, nextDate),' },

  /* Systeme › Parametres. */
  { nom: 'pas de carte des places', fichier: PR,
    avant: "{ouverte === 'places' && <CartePlacesLimitees />}", apres: '' },
  { nom: 'la tuile ne lit pas l offre', fichier: PR,
    avant: 'places: resumePlaces(reglageDesPlaces(offresDeLaMaison)),', apres: 'places: resumePlaces(reglageDesPlaces([])),' },
  { nom: 'la carte sans garde de la direction', fichier: K,
    avant: "    if (!estDirection) { toast('Ce réglage appartient à la direction.'); return; }\n    setOffres(", apres: '    setOffres(' },
  { nom: 'la carte n ecrit pas l offre', fichier: K,
    avant: "setOffres((prev) => offresApresLeReglage(prev, changes, { branchId: branch?.id ?? '' }));", apres: 'setOffres((prev) => prev);' },
  { nom: 'la carte tait qui lit le reglage', fichier: K,
    avant: 'Le site, Ma Couronne, la fenêtre du rendez-vous et la Caisse lisent ce réglage', apres: 'Ce réglage vaut ici' },
  { nom: 'la carte ne borne pas le pourcentage', fichier: K,
    avant: 'min={BORNES_DES_PLACES.pct.min} max={BORNES_DES_PLACES.pct.max}', apres: 'min={0} max={100}' },
  { nom: 'un tiret long dans la carte', fichier: K,
    avant: '<div className="sys-section__title">Places limitées</div>', apres: '<div className="sys-section__title">Places limitées — le réglage</div>' },
  { nom: 'un crochet sous un return dans la carte', fichier: K,
    avant: '  const ouverts = apercu.filter((j) => j.reste > 0);\n',
    apres: '  if (!branch) return null;\n  const ouverts = useMemo(() => apercu.filter((j) => j.reste > 0), [apercu]);\n' },
  { nom: 'la fiche annonce la famille aux prix convenus', fichier: U,
    avant: '(aUnPrixConvenu(client) || !!contratPourLaDate(subs, client.id, todayISO(), plans))', apres: '(false)' },
];

const md5 = (rel) => createHash('md5').update(readFileSync(path.join(racine, rel))).digest('hex');

const lance = async (panne) => {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-les-places-au-trone-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-les-places-au-trone.harnais.ts')],
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
