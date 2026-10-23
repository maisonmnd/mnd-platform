/* LES CORRECTIONS DE LA GRILLE, ÉPROUVÉES — 10 octobre 2026 (la genèse des prix, lot 4).

   La RÈGLE :
   - après une création, la suite est La Retouche comprise à quatre semaines,
     offerte ; après elle, la première venue ; jamais une seconde création ;
   - une seule horloge de fidélité : le Cercle et les sceaux du Foyer fermés
     ne reconnaissent personne ; l'Académie et une privatisation ne font pas
     monter de palier ;
   - 50 % et 100 % : la direction seulement ;
   - le Regard réglé se déduit de l'acte qui le suit sous 30 jours, une fois ;
   - le socle de la création se dit à tous les calibres.
   Attendus écrits à la main. `node scripts/verifie-les-corrections-de-la-grille.mjs` ;
   `--prouve` remet chaque faute une à une et exige que le banc crie. */
import { readFileSync } from 'node:fs';
import { suiteImposee } from '../src/shared/retouche-comprise-pur';
import { sansLaVisite } from '../src/shared/reprise-nue';
import { regardADeduire, remiseAvecLeRegard } from '../src/shared/regard-deduit-pur';
import { statutFidelite } from '../src/shared/accounts';
import { estDuCercle } from '../src/shared/offers';
import { palierDuCarnet } from '../src/shared/paliers';
import { plafondDeRemisePct, plafondDeRemiseXof, tauxPermis } from '../src/shared/pricing';
import { PHRASES } from '../src/shared/nouvelle-grille-pur';
import type { Client } from '../src/shared/clients';
import type { Appointment } from '../src/shared/agenda';
import type { Service } from '../src/shared/catalog';

let ko = 0;
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`));
  if (!ok) console.log(ascii(`       attendu ${JSON.stringify(attendu)}`));
};

/* ── 1. La Retouche comprise, puis la première venue ── */
const CAT = [
  { id: 'sv-retouches-post-reprise', durationMin: 40 }, { id: 'sv-kids-retouche', durationMin: 25 },
  { id: 'sv-venue-gbeji-ess', durationMin: 150, includes: [{ serviceId: 'sv-plt-05-ess-c' }, { serviceId: 'sv-atl-ii-e' }, { serviceId: 'sv-plt-50-sty-e', offert: true }] },
  { id: 'sv-kids-sinsin', durationMin: 40 },
  { id: 'sv-plt-05-ess-c' }, { id: 'sv-atl-ii-e' }, { id: 'sv-plt-50-sty-e' },
];
const creation = (id: string) => id.startsWith('sv-atl-i-');
const s1 = suiteImposee({ serviceIds: ['sv-atl-i-med'] }, creation, CAT);
dit('creation : La Retouche a 4 semaines, offerte, marquee comprise', [['sv-retouches-post-reprise'], 4, [{ pct: 100 }], true],
  [s1?.serviceIds, s1?.semaines, s1?.remisesLignes, s1?.retoucheComprise]);
dit('creation Kids : La Retouche Kids', ['sv-kids-retouche'], suiteImposee({ serviceIds: ['sv-kids-vekpe'] }, creation, CAT)?.serviceIds);
const s2 = suiteImposee({ serviceIds: ['sv-retouches-post-reprise'], retoucheComprise: true }, creation, CAT);
dit('apres la Retouche comprise : la venue a 2 semaines, sans remise, sans marque', [['sv-venue-gbeji-ess'], 2, undefined, undefined],
  [s2?.serviceIds, s2?.semaines, s2?.remisesLignes, s2?.retoucheComprise]);
dit('apres la Retouche Kids comprise : le SINSIN Kids', ['sv-kids-sinsin'],
  suiteImposee({ serviceIds: ['sv-kids-retouche'], retoucheComprise: true }, creation, CAT)?.serviceIds);
dit('Mini, Nano, Pico : la Retouche porte le SINSIN promis ; Medium et Micro non', [true, true, true, undefined, undefined],
  ['sv-atl-i-min', 'sv-atl-i-nan', 'sv-atl-i-pic', 'sv-atl-i-med', 'sv-atl-i-mic'].map((id) => suiteImposee({ serviceIds: [id], date: '2026-12-31' }, creation, CAT)?.sinsinOffert));
dit('au 1er janvier 2027 la Mini ne le promet plus ; Nano et Pico toujours', [undefined, true, true],
  ['sv-atl-i-min', 'sv-atl-i-nan', 'sv-atl-i-pic'].map((id) => suiteImposee({ serviceIds: [id], date: '2027-01-01' }, creation, CAT)?.sinsinOffert));
const s3 = suiteImposee({ serviceIds: ['sv-retouches-post-reprise'], retoucheComprise: true, sinsinOffert: true }, creation, CAT);
dit('la venue promise : ligne a ligne, le SINSIN et la sortie offerts, le KLOKLO a la carte', [['sv-plt-05-ess-c', 'sv-atl-ii-e', 'sv-plt-50-sty-e'], [null, { pct: 100 }, { pct: 100 }], 2],
  [s3?.serviceIds, s3?.remisesLignes, s3?.semaines]);
const s4 = suiteImposee({ serviceIds: ['sv-retouches-post-reprise'], retoucheComprise: true, sinsinOffert: true }, creation,
  CAT.map((s) => (s.id === 'sv-atl-ii-e' ? { ...s, archived: true } : s)));
dit('une ligne archivee : la venue entiere, la promesse dite', [['sv-venue-gbeji-ess'], true], [s4?.serviceIds, /offert : à déduire/.test(s4?.note ?? '')]);
dit('un entretien : la reprise ordinaire', null, suiteImposee({ serviceIds: ['sv-venue-gbeji-ess'] }, creation, CAT));
const nue = sansLaVisite({ id: 'a', retoucheComprise: true, sinsinOffert: true, regardDeduit: { apptId: 'k', xof: 1 }, deduitSur: 'b', serviceIds: ['x'] });
dit('la reprise ordinaire ne recopie ni la Retouche comprise, ni sa promesse, ni le Regard', ['id', 'serviceIds'], Object.keys(nue));
dit('une Retouche archivee ne s impose pas', null,
  suiteImposee({ serviceIds: ['sv-atl-i-med'] }, creation, [{ id: 'sv-retouches-post-reprise', archived: true }]));

/* ── 2. Une seule horloge de fidélité ── */
const elle = { id: 'c1' } as Client;
const visites = Array.from({ length: 9 }, (_, i) => ({ id: `r${i}`, clientId: 'c1', status: 'honoré', date: `2026-0${(i % 9) + 1}-10`, serviceIds: ['x'] })) as unknown as Appointment[];
const ouvert = statutFidelite(elle, [elle], [], visites, 7, 300000);
const ferme = statutFidelite(elle, [elle], [], visites, 7, 300000, false, false);
dit('Cercle ouvert (appel d hier) : membre ; ferme : personne', [true, 'cercle', false, 'aux-portes'],
  [ouvert.membreCercle, ouvert.genre, ferme.membreCercle, ferme.genre]);
dit('estDuCercle ferme ou ouvert', [false, true], [estDuCercle(10, 3, false), estDuCercle(10, 3, true)]);
const mere = { id: 'm1', familyId: 'f1' } as Client;
const fam = [{ id: 'f1', payerClientId: 'm1' }] as unknown as Parameters<typeof statutFidelite>[2];
const payees = [{ id: 'p', clientId: 'm1', status: 'honoré', date: '2026-09-01', serviceIds: ['x'], paidXof: 500000 }] as unknown as Appointment[];
dit('le Foyer ouvert atteint ; ferme, jamais', [true, false],
  [statutFidelite(mere, [mere], fam, payees, 7, 300000).foyerAtteint, statutFidelite(mere, [mere], fam, payees, 7, 300000, false, false).foyerAtteint]);

/* ── 3. Ni l'Académie ni une privatisation ne font monter ── */
const parId = new Map<string, Pick<Service, 'palier' | 'categoryId' | 'privatise'>>([
  ['venue', { palier: 'Élévation', categoryId: 'cat-venue' }],
  ['souv', { palier: 'Souveraineté', categoryId: 'cat-souverain' }],
  ['cert', { palier: 'Souveraineté', categoryId: 'aca-pro' }],
  ['priv', { palier: 'Souveraineté', categoryId: 'cat-venue', privatise: true }],
]);
const rdv = (d: string, ids: string[]) => ({ clientId: 'c1', status: 'honoré', date: d, serviceIds: ids }) as Appointment;
dit('une privatisation seule : aucun palier', null, palierDuCarnet({ id: 'c1' }, [rdv('2026-09-01', ['souv'])], parId, '2026-10-10').palier);
dit('une prestation privatisee hors Portes closes : aucun palier', null, palierDuCarnet({ id: 'c1' }, [rdv('2026-09-01', ['priv'])], parId, '2026-10-10').palier);
dit('le cursus certifiant ne rend pas Souveraine', 'Fondation',
  palierDuCarnet({ id: 'c1' }, [rdv('2026-09-01', ['venue']), rdv('2026-09-20', ['cert'])], parId, '2026-10-10').palier);
dit('deux venues et un cours : Fondation (le cours ne compte pas)', 'Fondation',
  palierDuCarnet({ id: 'c1' }, [rdv('2026-08-01', ['venue']), rdv('2026-09-01', ['venue']), rdv('2026-09-20', ['cert'])], parId, '2026-10-10').palier);
dit('trois venues : Elevation', 'Élévation',
  palierDuCarnet({ id: 'c1' }, [rdv('2026-07-01', ['venue']), rdv('2026-08-01', ['venue']), rdv('2026-09-01', ['venue'])], parId, '2026-10-10').palier);

/* ── 4. 50 % et 100 % : la direction ── */
dit('l equipe : jusqu a 25 % ; la direction : tout', [[5, 10, 15, 20, 25], [5, 10, 15, 20, 25, 50, 100]], [tauxPermis(false), tauxPermis(true)]);
dit('plafonds en % et en francs', [49, 100, 49000], [plafondDeRemisePct(false), plafondDeRemisePct(true), plafondDeRemiseXof(false, 100000)]);

/* ── 5. Le Regard déduit sous 30 jours ── */
const koko = (id: string, d: string, svc: string, extra: Record<string, unknown> = {}) => ({ id, clientId: 'c1', date: d, status: 'honoré', serviceIds: [svc], ...extra });
const paye = (a: { id: string }) => (a.id.startsWith('paye') ? 15000 : 0);
const prix = (id: string) => (id === 'sv-koko-ori' ? 15000 : id === 'sv-koko-sui' ? 10000 : 5000);
const R = (rdvs: ReturnType<typeof koko>[], ids: string[], d = '2026-10-20', rid = 'acte') =>
  regardADeduire({ rdv: { id: rid, clientId: 'c1', date: d, serviceIds: ids }, rdvs, estCreation: creation, payeXof: paye, prixDuRegard: prix });
dit('Origine regle il y a 19 jours : deduit de la creation, a son rang', { kokoId: 'paye-1', regardServiceId: 'sv-koko-ori', date: '2026-10-01', index: 1, xof: 15000 },
  R([koko('paye-1', '2026-10-01', 'sv-koko-ori')], ['sv-sup-01', 'sv-atl-i-med']));
dit('a 31 jours : rien', null, R([koko('paye-1', '2026-09-19', 'sv-koko-ori')], ['sv-atl-i-med']));
dit('non regle : rien', null, R([koko('libre-1', '2026-10-01', 'sv-koko-ori')], ['sv-atl-i-med']));
dit('un Regard annule, meme avec un acompte : rien', null, R([koko('paye-1', '2026-10-01', 'sv-koko-ori', { status: 'annulé' })], ['sv-atl-i-med']));
dit('deja deduit d un autre acte : rien ; du meme : oui', [null, 'paye-1'], [
  R([koko('paye-1', '2026-10-01', 'sv-koko-ori', { deduitSur: 'autre' })], ['sv-atl-i-med'])?.kokoId ?? null,
  R([koko('paye-1', '2026-10-01', 'sv-koko-ori', { deduitSur: 'acte' })], ['sv-atl-i-med'])?.kokoId ?? null,
]);
dit('Accueil : la restauration ; Conseil : la creation Kids', ['sv-koko-sui', 10000, 'svc-doto-conseil', 5000], [
  R([koko('paye-2', '2026-10-05', 'sv-koko-sui')], ['sv-atl-iv-ala-c'])?.regardServiceId, R([koko('paye-2', '2026-10-05', 'sv-koko-sui')], ['sv-atl-iv-ala-c'])?.xof,
  R([koko('paye-3', '2026-10-05', 'svc-doto-conseil')], ['sv-kids-vekpe'])?.regardServiceId, R([koko('paye-3', '2026-10-05', 'svc-doto-conseil')], ['sv-kids-vekpe'])?.xof,
]);
dit('le Regard d Origine ne se deduit pas d une restauration', null, R([koko('paye-1', '2026-10-01', 'sv-koko-ori')], ['sv-atl-iv-ala-c']));
dit('la remise de ligne garde son % et ajoute les francs', { pct: 10, xof: 20000 }, remiseAvecLeRegard({ pct: 10, xof: 5000 }, 15000));

/* ── 6. Le socle de la création ── */
const socle = PHRASES.filter((p) => p.id.startsWith('sv-atl-i-') && p.apres.includes('La Retouche à 4 semaines, posée d’office'));
dit('le socle se dit aux six creations', ['sv-atl-i-jum', 'sv-atl-i-med', 'sv-atl-i-min', 'sv-atl-i-mic', 'sv-atl-i-nan', 'sv-atl-i-pic'], socle.map((p) => p.id));
dit('ni Kofi ni « Retouches Post Création » dans le socle', [], socle.filter((p) => /Kòfí|Retouches Post Création/.test(p.apres)).map((p) => p.id));

/* ── 7. Les écrans (commentaires effacés) ── */
const sansCom = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const actions = sansCom('src/apps/trone/routes/clients/actions.tsx');
dit('la reprise : la suite imposee AVANT le rythme, et a l encaissement aussi', [true, true], [
  /const imposee = suiteImposee\([\s\S]*?if \(imposee\) \{[\s\S]*?return \{ pose: suiteI \};\s*\}\s*const rythme = rythmeDeReprise\(cliente, tous\);/.test(actions),
  /const imposeeE = suiteImposee\(/.test(actions),
]);
dit('la promesse du SINSIN passe a la Retouche posee, aux deux chemins', 2, (actions.match(/sinsinOffert: imposeeE?\.sinsinOffert/g) ?? []).length);
dit('les interrupteurs eteints par defaut, les sceaux gardes', [true, true, true], [
  /cercleActifStore = createStore<boolean>\('mnd_cercle_actif', false\)/.test(sansCom('src/shared/offers.ts')),
  /foyerActifStore = createStore<boolean>\('mnd_foyer_actif', false\)/.test(sansCom('src/shared/offers.ts')),
  /if \(foyerActifStore\.get\(\) && documentDescendu\('mnd_foyer_tiers'\)/.test(sansCom('src/apps/trone/shell/useParrainageVivant.ts')),
]);
dit('Ma Couronne et la fiche lisent les interrupteurs', [true, true], [
  /statutFidelite\(client, clients, families, appts, seuil, seuilFoyer, cercleOuvert, foyerOuvert\)/.test(sansCom('src/apps/couronne/Tabs.tsx')),
  /statutFidelite\(client, clientsBranche, families, branchAppts, seuilCercle, seuilFoyer, cercleOuvert, foyerOuvert\)/.test(sansCom('src/apps/trone/routes/clients/Customers.tsx')),
]);
const rdvModal = sansCom('src/apps/trone/routes/clients/_shared.tsx');
/* La Caisse en a trois depuis le 23 octobre 2026 : ligne, globale, et la remise gamme. */
dit('la direction : les taux et les plafonds aux quatre ecrans', [3, false, 3, 2, 2], [
  (rdvModal.match(/tauxPermis\(estDirection\)\.map\(/g) ?? []).length,
  /TAUX_DE_REMISE\.map\(/.test(rdvModal),
  (sansCom('src/apps/trone/routes/vente/Caisse.tsx').match(/tauxPermis\(estDirection\)/g) ?? []).length,
  (sansCom('src/apps/trone/routes/clients/SerieModal.tsx').match(/tauxPermis\(estDirection\)/g) ?? []).length,
  (sansCom('src/apps/trone/routes/vente/Factures.tsx').match(/estDirection \|\| v < 50/g) ?? []).length,
]);
dit('les remises a la main plafonnees : % et francs a la fiche, francs a la Caisse', [1, 1, 1], [
  (rdvModal.match(/Math\.min\(plafondDeRemisePct\(estDirection\)/g) ?? []).length,
  (rdvModal.match(/Math\.min\(plafondDeRemiseXof\(estDirection, effGross\)/g) ?? []).length,
  (sansCom('src/apps/trone/routes/vente/Caisse.tsx').match(/Math\.min\(plafondDeRemiseXof\(estDirection, subXof\)/g) ?? []).length,
]);
dit('Cercle ferme : ni carte du Cercle, ni « aux portes », et l interrupteur existe', [true, true, true, true], [
  /CARTES_DE_LA_MAISON\.filter\(\(c\) => c\.cle !== 'cercle' \|\| cercleActifStore\.get\(\)\)/.test(sansCom('src/apps/trone/routes/clients/CarteModal.tsx')),
  /\.filter\(\(c\) => cercleOuvert && eligibleCercle\(c\)/.test(sansCom('src/apps/trone/routes/equipe/Cercle.tsx')),
  /setCercleOuvert\(!cercleOuvert\)/.test(sansCom('src/apps/trone/routes/equipe/Parrainages.tsx')),
  /setFoyerOuvert\(!foyerOuvert\)/.test(sansCom('src/apps/trone/routes/equipe/Parrainages.tsx')),
]);
dit('le Regard se marque des deux cotes, aux deux enregistrements', [true, 2], [
  /if \(x\.id === acteId\) return \{ \.\.\.x, regardDeduit: \{ apptId: d\.kokoId, xof: d\.xof \} \};\s*if \(x\.id === d\.kokoId\) return \{ \.\.\.x, deduitSur: acteId \};/.test(rdvModal),
  (rdvModal.match(/if \(deduction\) marqueLaDeduction\(/g) ?? []).length,
]);
dit('la carte rejoue le socle (marque v2)', true, /mnd_nouvelle_grille_2026_10_maintenant_v2/.test(sansCom('src/shared/nouvelle-grille.ts')));
dit('les juges sont purs', [false, false], [/^\s*import\s/m.test(sansCom('src/shared/retouche-comprise-pur.ts')), /^\s*import\s/m.test(sansCom('src/shared/regard-deduit-pur.ts'))]);

console.log(ko === 0 ? '\nLes corrections de la grille tiennent.' : `\n${ko} epreuve(s) en echec.`);
