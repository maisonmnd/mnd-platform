/* LE POINT FINANCIER D'UNE CLIENTE, ÉPROUVÉ — `node scripts/verifie-le-point.mjs`.

   21 novembre 2026, maquette GqBogAWn…, « construis ». Le banc rejoue les
   règles pures (`shared/le-point-pur`, et les relances programmées de
   `shared/relances-pur`) et lit dans leur source que la page passe par les
   portes de la Maison : les prix de la fenêtre du rendez-vous, la facture qui
   suit son rituel, l'envoi du point qui existait. Toutes les têtes sont
   inventées : le dépôt est public. */
import { readFileSync } from 'node:fs';
import {
  FILTRES_DU_POINT, LIBELLE_DU_RESTE, estUnePieceDuReste, resteAJour, ajouteLaLigne, attendLeModeleDuPoint, comptesDesFiltres, dernierPasDeLaPiece, etatDeLEnvoi, etatDuReglement, gesteDuPoint,
  idDuPlan, lignesChangees, nouveauPlan, passeLeFiltre, plansDesPieces, poseLaRemiseDeLigne, remiseAjouteeXof, remiseLue, retireLaLigne, seCoche,
  suiviDesPieces, type EnvoiLu, type LignesDuRituel,
} from '../src/shared/le-point-pur';
import {
  arreteLePlan, decaleLaProchaine, idDeLaRelanceProgrammee, joursAVenirDuPlan, joursDuPlan, planLu, relanceProgrammeeDuJour, sauteLaProchaine,
} from '../src/shared/relances-pur';
import { peutVoir, ECRANS_NES_APRES_LES_DEPARTEMENTS, domaineDe } from '../src/apps/trone/routes/index';

let ko = 0;
let n = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)?.slice(0, 220)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)?.slice(0, 220)}`);
};
const lit = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

/* ── 1. L'état d'une ligne et les filtres ── */
{
  dit('l etat d une ligne : annule, a venir, rien a regler, reglee, en partie, a regler', ['annule', 'a-venir', 'gratuit', 'regle', 'partiel', 'du'], [
    etatDuReglement({ annule: true, totalXof: 30000, verseXof: 0, resteXof: 30000 }),
    etatDuReglement({ aVenir: true, totalXof: 30000, verseXof: 10000, resteXof: 20000 }),
    etatDuReglement({ totalXof: 0, verseXof: 0, resteXof: 0 }),
    etatDuReglement({ totalXof: 30000, verseXof: 30000, resteXof: 0 }),
    etatDuReglement({ totalXof: 32000, verseXof: 20000, resteXof: 12000 }),
    etatDuReglement({ totalXof: 35000, verseXof: 0, resteXof: 35000 }),
  ]);
  const L = [
    { etat: 'du' as const, pieces: [] }, { etat: 'partiel' as const, pieces: [1] }, { etat: 'regle' as const, pieces: [1] },
    { etat: 'a-venir' as const, pieces: [] }, { etat: 'annule' as const, pieces: [] }, { etat: 'gratuit' as const, pieces: [1] },
  ];
  dit('les filtres comptent avec le meme juge que la liste', { tout: 6, 'a-regler': 2, regles: 1, 'a-venir': 1, factures: 3, annules: 1 }, comptesDesFiltres(L));
  dit('... six filtres, et « a regler » garde le du et le partiel', [6, [true, true, false, false, false, false]], [FILTRES_DU_POINT.length, L.map((l) => passeLeFiltre(l, 'a-regler'))]);
  dit('seule une ligne qui doit et qui a eu lieu se coche', [true, true, false, false, false, false], L.map(seCoche));
}

/* ── 2. Le suivi WhatsApp ── */
{
  dit('l etat d un envoi : l accuse de Meta l emporte, un echec se dit', ['lu', 'remis', 'non-remis', 'envoye', 'en-attente', 'echec', 'ecarte', 'echec'], [
    etatDeLEnvoi({ statut: 'envoyé', etat: 'lu' }), etatDeLEnvoi({ statut: 'envoyé', etat: 'remis' }), etatDeLEnvoi({ etat: 'non-remis' }),
    etatDeLEnvoi({ statut: 'envoyé' }), etatDeLEnvoi({ statut: 'en-attente' }), etatDeLEnvoi({ statut: 'échec' }), etatDeLEnvoi({ statut: 'écarté' }), etatDeLEnvoi({ statut: 'périmé' }),
  ]);
  const pieces = [
    { id: 'f1', number: 'F-1', partieLe: '2026-11-16T09:02:00Z', modele: 'point' }, { id: 'f2', number: 'F-2', partieLe: '2026-11-16T09:02:00Z', modele: 'point' },
    { id: 'f3', number: 'F-3', partieLe: '2026-11-14T11:15:00Z', modele: 'facture' }, { id: 'f4', number: 'F-4' },
  ];
  const journal: EnvoiLu[] = [
    { id: 'rl-f3-1-whatsapp', type: 'relance-facture', statut: 'envoyé', etat: 'lu', accuseLe: '2026-11-17T10:40:00Z', quand: '2026-11-17T09:01:00Z', invoiceId: 'f3' },
    { id: 'rl-pg-abc-2026-11-23-whatsapp', type: 'relance-facture', statut: 'en-attente', quand: '2026-11-23T09:00:00Z', invoiceIds: ['f1', 'f2'], point: true, programmee: 'abc' },
    { id: 'autre', type: 'rappel-j1', statut: 'envoyé', quand: '2026-11-18T09:00:00Z', invoiceId: 'f1' },
    { id: 'etrangere', type: 'relance-facture', statut: 'envoyé', quand: '2026-11-19T09:00:00Z', invoiceId: 'fx' },
  ];
  const s = suiviDesPieces(pieces, journal);
  dit('le suivi : un point parti en une fois se dit une fois, les relances suivent, le plus recent d abord ; ni un autre type ni une piece d ailleurs',
    [['programmee', ['f1', 'f2'], 'en-attente'], ['relance', ['f3'], 'lu'], ['piece', ['f1', 'f2'], 'envoye'], ['piece', ['f3'], 'envoye']],
    s.map((x) => [x.genre, x.pieceIds, x.etat]));
  dit('... la relance lue garde l heure de sa lecture ; le dernier mot d une piece est le plus recent', ['2026-11-17T10:40:00Z', 'relance', null],
    [s[1].luLe, dernierPasDeLaPiece('f3', s)?.genre, dernierPasDeLaPiece('f4', s)]);
}

/* ── 3. Les plans de relance ── */
{
  dit('les jours d un plan : le premier hors dimanche, puis tous les 7 jours, quatre au plus', ['2026-11-23', '2026-11-30', '2026-12-07', '2026-12-14'], joursDuPlan('2026-11-22', 7));
  dit('... une fois : un seul jour ; un pas inconnu vaut une fois ; un jour mal forme, rien', [['2026-11-24'], ['2026-11-24'], []], [joursDuPlan('2026-11-24', 0), joursDuPlan('2026-11-24', 5), joursDuPlan('24/11/2026', 7)]);
  dit('... jamais un dimanche, meme au milieu (14 jours depuis un lundi tombe un lundi)', true, joursDuPlan('2026-11-23', 14).every((j) => new Date(`${j}T12:00:00Z`).getUTCDay() !== 0));
  const p = nouveauPlan({ id: 'k1-ab12', debut: '2026-11-23', pas: 7, le: '2026-11-21T10:00:00Z', par: 'Direction' });
  dit('un plan neuf : son identifiant, ses jours, quand et par qui', { plan: 'k1-ab12', jours: ['2026-11-23', '2026-11-30', '2026-12-07', '2026-12-14'], le: '2026-11-21T10:00:00Z', par: 'Direction' }, p);
  dit('... un identifiant sans donnee de cliente : l instant et un hasard', [true, null], [/^[a-z0-9]+-[a-z0-9]{1,6}$/.test(idDuPlan(1795279134000, 'Xy9!zz')), nouveauPlan({ id: 'Awa Kossou', debut: '2026-11-23', pas: 0, le: 'x' })]);
  dit('un plan lu en base ne se croit pas sur parole', [null, null, ['2026-11-23', '2026-11-30']], [
    planLu({ plan: '', jours: ['2026-11-23'], le: 'x' }), planLu({ plan: 'a', jours: ['hier'], le: 'x' }),
    planLu({ plan: 'a', jours: ['2026-11-30', '2026-11-22', '2026-11-23'], le: 'x' })?.jours]);
  const P = p!;
  dit('la relance part le jour dit, pas un autre, pas un jour saute, pas un plan arrete, jamais le dimanche', [true, false, false, false, false], [
    relanceProgrammeeDuJour(P, '2026-11-23'), relanceProgrammeeDuJour(P, '2026-11-24'),
    relanceProgrammeeDuJour({ ...P, sautes: ['2026-11-23'] }, '2026-11-23'), relanceProgrammeeDuJour(arreteLePlan(P, 'z'), '2026-11-23'),
    relanceProgrammeeDuJour({ ...P, jours: ['2026-11-22'] }, '2026-11-22')]);
  dit('sauter la prochaine : son jour seul ; les suivantes restent', [['2026-11-23'], ['2026-11-30', '2026-12-07', '2026-12-14']],
    [sauteLaProchaine(P, '2026-11-21').sautes, joursAVenirDuPlan(sauteLaProchaine(P, '2026-11-21'), '2026-11-21')]);
  dit('decaler la prochaine : son jour remplace, hors dimanche ; jamais avant demain ni sur un jour deja prevu',
    [['2026-11-26', '2026-11-30', '2026-12-07', '2026-12-14'], ['2026-11-30', '2026-12-07', '2026-12-14', '2026-12-28'], P.jours, P.jours],
    [decaleLaProchaine(P, '2026-11-21', '2026-11-26').jours, decaleLaProchaine(P, '2026-11-21', '2026-12-27').jours,
      decaleLaProchaine(P, '2026-11-21', '2026-11-21').jours, decaleLaProchaine(P, '2026-11-21', '2026-11-30').jours]);
  dit('l identifiant d une relance programmee : une par plan et par jour', 'rl-pg-k1-ab12-2026-11-23-whatsapp', idDeLaRelanceProgrammee('k1-ab12', '2026-11-23'));

  const pieces = [{ id: 'f1', relanceProgrammee: { ...P, jours: ['2026-11-16', '2026-11-23', '2026-11-30'], sautes: ['2026-11-30'] } }, { id: 'f2', relanceProgrammee: { ...P, jours: ['2026-11-16', '2026-11-23', '2026-11-30'], sautes: ['2026-11-30'] } }, { id: 'f3' }];
  const journal: EnvoiLu[] = [{ id: idDeLaRelanceProgrammee('k1-ab12', '2026-11-16'), type: 'relance-facture', statut: 'envoyé', etat: 'lu', quand: '2026-11-16T09:00:00Z', invoiceIds: ['f1', 'f2'] }];
  const e = plansDesPieces(pieces, journal, '2026-11-21');
  dit('l etat d un plan : ses pieces, chaque jour dit (parti et lu, prochaine, saute), vivant', [1, ['f1', 'f2'], [['2026-11-16', 'partie', 'lu'], ['2026-11-23', 'prochaine', null], ['2026-11-30', 'sautee', null]], '2026-11-23', true],
    [e.length, e[0].pieceIds, e[0].jours.map((j) => [j.jour, j.etat, j.envoi ?? null]), e[0].prochaine, e[0].vivant]);
  const deuxNumeros: EnvoiLu[] = [{ id: 'rl-pg-k1-ab12-cl9-2026-11-16-whatsapp', type: 'relance-facture', statut: 'envoyé', etat: 'remis', quand: '2026-11-16T09:00:00Z', programmee: 'k1-ab12' }];
  dit('... une ligne deposee pour un autre numero (la fiche dans son identifiant) se retrouve par son plan et son jour', ['partie', 'remis'],
    [plansDesPieces(pieces, deuxNumeros, '2026-11-21')[0].jours[0].etat, plansDesPieces(pieces, deuxNumeros, '2026-11-21')[0].jours[0].envoi]);
  const e2 = plansDesPieces([{ id: 'f1', relanceProgrammee: { ...P, jours: ['2026-11-16', '2026-11-23'], arreteLe: '2026-11-20T08:00:00Z' } }], [], '2026-11-21');
  dit('... un jour passe sans depart se dit ; un plan arrete n a plus de prochaine', [['sans-depart', 'sans-depart'], undefined, false, true], [e2[0].jours.map((j) => j.etat), e2[0].prochaine, e2[0].vivant, e2[0].arrete]);
  dit('le rappel groupe de jours differents attend le modele du point ; un seul jour, ou le modele, non', [true, false, false], [
    attendLeModeleDuPoint(['2026-10-17', '2026-11-14'], false), attendLeModeleDuPoint(['2026-11-14', '2026-11-14'], false), attendLeModeleDuPoint(['2026-10-17', '2026-11-14'], true)]);
}

/* ── 4. L'édition des lignes : les tableaux paralleles restent alignes ── */
{
  const a: LignesDuRituel = { serviceIds: ['s1', 's2', 's3'], remisesLignes: [null, { pct: 20 }, { xof: 1000 }], mains: [['m1'], [], ['m2']] };
  dit('retirer la ligne 2 : sa remise et ses mains partent avec elle, jamais la voisine', { serviceIds: ['s1', 's3'], remisesLignes: [null, { xof: 1000 }], mains: [['m1'], ['m2']] }, retireLaLigne(a, 1));
  dit('... la derniere ligne ne se retire pas ; un index hors des lignes ne change rien', [['s1'], ['s1', 's2', 's3']],
    [retireLaLigne({ serviceIds: ['s1'] }, 0).serviceIds, retireLaLigne(a, 9).serviceIds]);
  dit('ajouter une prestation : en derniere ligne, sans remise, faite par le maitre du rendez-vous', { serviceIds: ['s1', 's2', 's3', 's4'], remisesLignes: [null, { pct: 20 }, { xof: 1000 }, null], mains: [['m1'], [], ['m2'], []] }, ajouteLaLigne(a, 's4'));
  dit('... sans remise ni main nulle part, aucun tableau vide n est ecrit', { serviceIds: ['s1', 's2'], remisesLignes: undefined, mains: undefined }, ajouteLaLigne({ serviceIds: ['s1'] }, 's2'));
  dit('la remise d une ligne : en %, plafonnee a 100 ; en francs ; une saisie vide l efface', [{ pct: 100 }, { xof: 2500 }, undefined],
    [poseLaRemiseDeLigne(a, 0, 150, '%').remisesLignes?.[0], poseLaRemiseDeLigne(a, 0, 2500, 'F').remisesLignes?.[0], poseLaRemiseDeLigne({ serviceIds: ['s1'], remisesLignes: [{ pct: 10 }] }, 0, 0, '%').remisesLignes]);
  dit('... relue pour l ecran', [{ valeur: 20, unite: '%' }, { valeur: 1000, unite: 'F' }, { valeur: 0, unite: '%' }], [remiseLue(a, 1), remiseLue(a, 2), remiseLue(a, 0)]);
  dit('les lignes changent quand une prestation ou une remise change ; une main seule, non', [true, true, false, false],
    [lignesChangees(a, retireLaLigne(a, 0)), lignesChangees(a, poseLaRemiseDeLigne(a, 0, 5, '%')), lignesChangees(a, { ...a, mains: [['x'], [], []] }), lignesChangees({ serviceIds: ['s1'] }, { serviceIds: ['s1'], remisesLignes: [null] })]);
  dit('une remise ajoutee : un % se lit sur la base, arrondi au franc ; jamais plus que le plafond ; jamais negative', [3500, 12000, 0, 2000],
    [remiseAjouteeXof(35000, 10, '%', 35000), remiseAjouteeXof(35000, 15000, 'F', 12000), remiseAjouteeXof(35000, -5, 'F', 35000), remiseAjouteeXof(20000, 10, '%', 99999)]);
}

/* ── 4 bis. La pièce du reste d'un rituel payé en partie ── */
{
  const piece = { lines: [{ label: LIBELLE_DU_RESTE('Reprise des racines + Soin'), unitXof: 12000, qty: 1 }] };
  dit('la piece du reste : une ligne « Reglement · … », la forme que l alignement ne retarife pas', [true, false],
    [estUnePieceDuReste(piece), estUnePieceDuReste({ lines: [{ label: 'Reprise des racines' }, { label: 'Soin' }] })]);
  dit('... remise au nouveau reste ; rien si rien ne change, ni si elle a deja recu de l argent, ni si ce n est pas une piece du reste', [7000, null, null, null], [
    resteAJour(piece, 7000)?.lines[0].unitXof, resteAJour(piece, 12000), resteAJour({ ...piece, payments: [{}] }, 7000), resteAJour({ lines: [{ label: 'Reprise', unitXof: 1, qty: 1 }] }, 7000)]);
  const page = lit('src/apps/trone/routes/clients/LePoint.tsx');
  dit('la page : un rituel paye en partie recoit la piece de son reste, jamais une piece au prix entier ; une remise la remet a jour', [true, true, true], [
    page.includes('if (l.verseXof > 0) {') && page.includes('lines: [{ id: `l-${Date.now().toString(36)}`, label: LIBELLE_DU_RESTE(l.quoi), qty: 1, unitXof: l.resteXof, discountPct: 0 }],'),
    page.indexOf('if (l.verseXof > 0) {') < page.indexOf('const r = factureAEnvoyer('),
    page.includes('const r = resteAJour(i, du);')]);
}

/* ── 5. Ce qu'on peut faire d'un rendez-vous sur la page ── */
{
  const base = { annule: false, aVenir: false, argentRecu: false, resteXof: 35000, netXof: 35000, remiseFamille: false, forfait: false, couvert: false, suite: false, prixLibre: false };
  dit('un rituel passe sans argent : tout ; a venir : les remises ; argent recu : une remise sur ce qui reste, ou rien s il est solde',
    ['tout', 'remises', 'ajout', 'fenetre'], [gesteDuPoint(base), gesteDuPoint({ ...base, aVenir: true }), gesteDuPoint({ ...base, argentRecu: true, resteXof: 12000 }), gesteDuPoint({ ...base, argentRecu: true, resteXof: 0 })]);
  dit('... une remise famille : une remise en plus ; un forfait, une formule, une suite, un devis, un annule : sa fenetre', ['ajout', 'fenetre', 'fenetre', 'fenetre', 'fenetre', 'fenetre'], [
    gesteDuPoint({ ...base, remiseFamille: true }), gesteDuPoint({ ...base, forfait: true }), gesteDuPoint({ ...base, couvert: true }),
    gesteDuPoint({ ...base, suite: true }), gesteDuPoint({ ...base, prixLibre: true }), gesteDuPoint({ ...base, annule: true })]);
}

/* ── 6. La page passe par les portes de la Maison ── */
{
  const page = lit('src/apps/trone/routes/clients/LePoint.tsx');
  const donnees = lit('src/apps/trone/routes/clients/le-point-donnees.ts');
  const fiche = lit('src/apps/trone/routes/clients/Customers.tsx');
  const routes = lit('src/apps/trone/routes/index.tsx');
  const choix = lit('src/apps/trone/routes/clients/ChoisirPourLePoint.tsx');
  dit('la route /point vit dans Vente & Caisse, AU MENU (25 nov.), et la fiche y mene', [true, 'dept-vente-caisse', true, true], [
    /\{ path: '\/point', label: 'Le point', icon: HandCoins, Component: lazy\(\(\) => import\('\.\/clients\/LePoint'\)\) \}/.test(routes),
    domaineDe('/point'), ECRANS_NES_APRES_LES_DEPARTEMENTS.includes('/point'), fiche.includes("navigate(`/point?id=${encodeURIComponent(client.id)}`)}>Le point</Button>")]);
  dit('ouvert par le menu, sans cliente : on la choisit ; une cliente introuvable renvoie au choix', [true, true, true], [
    page.includes('  if (!clientId) return <ChoisirPourLePoint />;\n  if (!p.client) {'), page.includes('<Link to="/point">Choisir une autre cliente</Link>'),
    page.includes("import ChoisirPourLePoint from './ChoisirPourLePoint';")]);
  dit('le choix : celles qui doivent, par le juge des Creances (le du du Carnet), puis la fiche choisie', [true, true, true, true], [
    choix.includes('creancesDeLaMaison({ appts, aujourdhui, dûDuRituel: (a) => apptDueXof(a, byId) })'), choix.includes('const appts = useBranchAppointments();'),
    choix.includes('const aujourdhui = momentDuSalon().jour;'), choix.includes('navigate(`/point?id=${encodeURIComponent(id)}`)')]);
  dit('la recherche : toutes les clientes de la branche, celles qui doivent devant', [true, true], [
    choix.includes('const clients = useBranchClients();'), choix.includes('.sort((a, b) => (a.c ? 0 : 1) - (b.c ? 0 : 1) || ')]);
  dit('qui la voit : la direction ; un maitre seulement avec Vente & Caisse', [true, true, false, true, false], [
    peutVoir('souverain', '/point', {}), peutVoir('gerant', '/point', {}), peutVoir('maitre', '/point', {}), peutVoir('maitre', '/point', { 'dept-vente-caisse': true }), peutVoir('maitre', '/point', { 'dept-finances': true })]);
  dit('la piece d une formule ne se coche pas (ses echeances se relancent une a une) ; un rituel couvert non plus', [true, true, true], [
    donnees.includes('cochable: reste > 0 && !piecesDesFormules.has(i.id) && !/^Abonnement\\b/.test(i.note ?? \'\'),'),
    donnees.includes('cochable: !annule && !aVenir && reste > 0 && !a.coveredBySub,'), page.includes('{l.cochable && (')]);
  dit('les montants sont ceux du Carnet et du compte : le net, le du, le reste d une facture', [true, true, true], [
    donnees.includes('const net = annule ? 0 : apptNetXof(a, byId);'), donnees.includes('const reste = annule ? 0 : apptDueXof(a, byId);'), donnees.includes('const reste = invoiceResteXof(i);')]);
  dit('l editeur : le tarif de SA tete, le brut de la fenetre, l arrondi du code, puis la facture qui suit', [true, true, true, true], [
    page.includes('const ctx = point.ctxDe(point.ficheDe(appt.clientId));'),
    page.includes('const priceXof = change ? brut + arrondiDuCodeAuRdv({ ...brouillon, priceXof: undefined }, point.byId, brut) : appt.priceXof;'),
    page.includes('const brut = brutDuRituel(brouillon, point.byId, tarifs);'),
    page.includes('if (maj) alignerFacturesDuRituel(maj, point.byId, tarifsFinaux.prixPlein, point.produits, tarifsFinaux.gesteDe, { argent: f, lockCount: tarifsFinaux.pricing.lockCount });')]);
  dit('... une remise sur ce qui reste ne depasse jamais le reste quand de l argent est recu', true,
    page.includes("const plafond = geste === 'ajout' && ligne.verseXof > 0 ? apptDueXof(appt, point.byId) : netSans;"));
  dit('... les lignes ne s ecrivent que si elles ont change ; une remise ajoutee s ajoute aux remises du rituel', [true, true], [
    page.includes('...(change ? { serviceIds: lignes.serviceIds, remisesLignes: lignes.remisesLignes, mains: lignes.mains, priceXof } : {}),'),
    page.includes('...(ajout > 0 ? { discountXof: (x.discountXof ?? 0) + ajout } : {}),')]);
  dit('le point part par le chemin qui existait (le PDF, le lien), un rituel sans facture recoit la sienne', [true, true], [
    page.includes('await envoi.point(p.payeurId, ids, { renvoi: true });'), page.includes('const r = factureAEnvoyer(l.appt, p.byId, l.appt.branchId, t.prixPlein, t.gesteDe);')]);
  dit('la relance programmee s ecrit sur chaque piece choisie, avec le meme plan ; les gestes passent par les regles pures', [true, true, true, true], [
    page.includes('invoicesStore.set((prev) => prev.map((i) => (ids.includes(i.id) ? { ...i, relanceProgrammee: plan } : i)));'),
    page.includes('geste((pl) => sauteLaProchaine(pl, aujourdhui))'), page.includes('geste((pl) => decaleLaProchaine(pl, aujourdhui, decale))'),
    page.includes('geste((pl) => arreteLePlan(pl, new Date().toISOString()))')]);
  dit('la page dit d avance ce qui ne partira pas : le modele du point, Tap & Go', [true, true], [
    page.includes('{attend && <p className="trp-point__alerte">'), page.includes('{!p.relancesPossibles && <p className="trp-point__alerte">')]);
  dit('aucun envoi a la main dans la page : ni whatsapp-envoi, et la seule fonction appelee est la lecture (GET) de relances-factures', [false, ["functions.invoke('relances-factures', { method: 'GET' })"]],
    [/whatsapp-envoi/.test(page + donnees), (page + donnees).match(/functions\.invoke\([^)]*\)/g)]);
  dit('le modele du point se demande a la fonction ; le reglage n est qu un repli', true, donnees.includes('modelePoint: modeleVu ?? settings.relances?.modelePoint === true,'));
  dit('le jour de la page est celui de Cotonou, pas celui du poste', [true, false], [donnees.includes('const aujourdhui = momentDuSalon().jour;'), /todayISO\(\)/.test(page + donnees)]);
}

console.log(`\n${n - ko}/${n} epreuves : le point financier d une cliente.`);
if (ko) { console.log(`${ko} ECHEC(S).`); process.exitCode = 1; }
