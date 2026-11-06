/* LE CHEMIN DE SCEAUX ET LES RUBRIQUES REPLIÉES, ÉPROUVÉS · 6 novembre 2026.
   `node scripts/verifie-le-chemin-de-sceaux.mjs` (et `--prouve`).
   Lot 1 de l'abonnement refait (maquette `public/maquette-l-abonnement-refait.html`,
   « construis » de Yéman le 6 novembre 2026) : un sceau par séance, dans
   l'ordre où elle les vit ; les comptes restent ceux du relevé ; « Ma formule »
   en trois rubriques repliées ; une seule alerte en haut de l'accueil.
   Personnes et dates inventées. */
import { readFileSync } from 'node:fs';
import { cheminDeLaLigne, etatDuPas, PLUS_LONG_CHEMIN, type Pas } from '../src/shared/chemin-de-sceaux-pur';
import { releveDeLAbonnee, type ContratLu, type LigneDeSeances, type SeanceDuContrat, type SeanceLue } from '../src/shared/abonnee-pur';
import type { Plan } from '../src/shared/abonnements';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};

/* ── 1. Le chemin, sur des relevés écrits à la main ── */
const seance = (id: string, date: string, etat: SeanceDuContrat['etat'], compte = true): SeanceDuContrat =>
  ({ id, date, time: '09:00', serviceIds: ['svc-g'], etat, compte, rendue: false, rang: null, total: null });
const ligne = (x: Partial<LigneDeSeances>): LigneDeSeances =>
  ({ serviceId: 'svc-g', incluses: 6, faites: 0, reservees: 0, aCloturer: 0, disponibles: 6, depasse: 0, seances: [], ...x });
const etats = (p: Pas[] | null) => (p ? p.map((x) => x.etat) : null);

const trois = [seance('r1', '2026-10-06', 'faite'), seance('r2', '2026-10-16', 'faite'), seance('r3', '2026-11-03', 'confirmee')];
const c1 = cheminDeLaLigne({ attribuees: trois }, ligne({ faites: 2, reservees: 1, disponibles: 3, seances: ['r1', 'r2', 'r3'] }), false);
dit('deux faites, une réservée, trois disponibles : six sceaux dans cet ordre', ['faite', 'faite', 'reservee', 'disponible', 'disponible', 'disponible'], etats(c1));
dit('... numérotés de 1 à 6', [1, 2, 3, 4, 5, 6], c1?.map((x) => x.n));
dit('... les séances réelles portent leur rendez-vous et leur date, les disponibles non', [['r1', '2026-10-06'], ['r3', '2026-11-03'], [undefined, undefined]],
  [[c1?.[0].id, c1?.[0].date], [c1?.[2].id, c1?.[2].date], [c1?.[3].id, c1?.[3].date]]);

/* UNE SÉANCE MANQUÉE NE SE PERD PAS (Yéman, 6 novembre 2026 : « dans le chemin
   des sceaux enlève Manqué ») : annulée ou absente, elle ne prend pas de sceau. */
const vie = [seance('a', '2026-08-08', 'faite'), seance('b', '2026-09-19', 'annulee', false), seance('c', '2026-10-31', 'faite'), seance('d', '2026-12-12', 'a-confirmer')];
const cheminDeVie = cheminDeLaLigne({ attribuees: vie }, ligne({ faites: 2, reservees: 1, disponibles: 3, seances: ['a', 'b', 'c', 'd'] }), false);
dit('une séance annulée au milieu ne laisse aucun sceau : faite, faite, réservée, puis trois disponibles', ['faite', 'faite', 'reservee', 'disponible', 'disponible', 'disponible'], etats(cheminDeVie));
dit('... et les séances gardent leur ordre et leur date', ['2026-08-08', '2026-10-31', '2026-12-12'], cheminDeVie?.slice(0, 3).map((x) => x.date));
dit('proposée, à confirmer, passée restée confirmée : trois réservées', ['reservee', 'reservee', 'reservee'],
  [etatDuPas({ etat: 'proposee' }), etatDuPas({ etat: 'a-confirmer' }), etatDuPas({ etat: 'a-cloturer' })]);
dit('une formule terminée : les séances non prises sont perdues', ['faite', 'faite', 'reservee', 'perdue', 'perdue', 'perdue'],
  etats(cheminDeLaLigne({ attribuees: trois }, ligne({ faites: 2, reservees: 1, disponibles: 3, seances: ['r1', 'r2', 'r3'] }), true)));
dit('une prestation sans limite n a pas de chemin', null, cheminDeLaLigne({ attribuees: trois }, ligne({ incluses: null, disponibles: null, seances: ['r1'] }), false));
const avecAnnulee = cheminDeLaLigne({ attribuees: [seance('r1', '2026-10-06', 'faite'), seance('rx', '2026-10-12', 'annulee', false)] }, ligne({ faites: 1, disponibles: 5, seances: ['r1', 'rx'] }), false);
dit('une séance annulée ou rendue ne prend pas de sceau, et la faite garde sa date', [['faite', 'disponible', 'disponible', 'disponible', 'disponible', 'disponible'], 'r1', '2026-10-06'],
  [etats(avecAnnulee), avecAnnulee?.[0].id, avecAnnulee?.[0].date]);
const avecAutre = cheminDeLaLigne({ attribuees: [seance('r1', '2026-10-06', 'faite'), seance('autre', '2026-10-07', 'faite')] }, ligne({ faites: 1, disponibles: 5, seances: ['r1'] }), false);
dit('la séance d une autre prestation du contrat ne vient pas sur ce chemin, et la sienne garde sa date', [['faite', 'disponible', 'disponible', 'disponible', 'disponible', 'disponible'], 'r1', '2026-10-06'],
  [etats(avecAutre), avecAutre?.[0].id, avecAutre?.[0].date]);
const ancien = cheminDeLaLigne({ attribuees: [] }, ligne({ faites: 2, reservees: 1, disponibles: 3, seances: [] }), false);
dit('quand les séances datées ne disent pas le compte de la ligne, le relevé commande, sans dates', [['faite', 'faite', 'reservee', 'disponible', 'disponible', 'disponible'], undefined],
  [etats(ancien), ancien?.[0].date]);
dit('l ancien carnet épuisé : six sceaux perdus, aucun inventé', ['perdue', 'perdue', 'perdue', 'perdue', 'perdue', 'perdue'],
  etats(cheminDeLaLigne({ attribuees: [] }, ligne({ disponibles: 0, seances: [] }), true)));
const sept = Array.from({ length: 7 }, (_, i) => seance(`s${i}`, `2026-0${i + 1}-10`, 'faite'));
dit('jamais plus de sceaux que de séances vendues', 6,
  cheminDeLaLigne({ attribuees: sept }, ligne({ faites: 7, disponibles: 0, depasse: 1, seances: sept.map((s) => s.id) }), false)?.length);
dit('au-delà de douze séances, la page dit le compte en mots', 12, PLUS_LONG_CHEMIN);

/* ── 2. Le chemin, sur un relevé rendu par le juge ── */
const plan = { id: 'pl-six', name: 'GBÈJÍ™ · Carnet de Six', tag: '', priceXof: 140000, line: '', perks: [], popular: false, included: [{ serviceId: 'svc-g', qty: 6 }], mode: 'pack', validityDays: 270 } as Plan;
const sub = {
  id: 'sub-1', branchId: 'm', clientId: 'c1', name: 'A. D.', planId: 'pl-six', slot: '', nextIso: '2026-11-01', since: '', sinceIso: '2026-10-02', startIso: '2026-10-02',
  expiresIso: '2027-06-29', status: 'active', reference: 'ABO-2026-014', mrrXof: 0, priceXof: 140000, prixConvenuXof: 140000,
  echeances: [{ numero: 1, dueIso: '2026-10-02', amountXof: 70000 }, { numero: 2, dueIso: '2026-11-01', amountXof: 70000 }],
  payments: [{ id: 'p1', date: '2026-10-02', amountXof: 70000 }],
} as ContratLu;
const rdv = (id: string, date: string, status: SeanceLue['status'], x: Partial<SeanceLue> = {}): SeanceLue =>
  ({ id, branchId: 'm', clientId: 'c1', serviceIds: ['svc-g'], date, time: '10:00', master: '', status, ...x }) as SeanceLue;
const appts = [
  rdv('r1', '2026-10-06', 'honoré', { coveredBySub: true, subId: 'sub-1', coverKind: 'abonnement' }),
  rdv('r2', '2026-10-16', 'honoré', { coveredBySub: true, subId: 'sub-1', coverKind: 'abonnement' }),
  rdv('r3', '2026-11-03', 'confirmé', { coveredBySub: true, subId: 'sub-1', coverKind: 'abonnement' }),
  rdv('rx', '2026-10-12', 'annulé', { priceXof: 30000 }),
];
const releve = releveDeLAbonnee({ jour: '2026-10-20', clientId: 'c1', subs: [sub], plans: [plan], appts, invoices: [], restesHorsFormule: [] });
const c = releve.contrats[0];
const l = c.seances[0];
const chemin = cheminDeLaLigne(c, l, false);
dit('sur le relevé du juge : faite, faite, réservée, puis trois disponibles', ['faite', 'faite', 'reservee', 'disponible', 'disponible', 'disponible'], etats(chemin));
const combien = (e: Pas['etat']) => (chemin ?? []).filter((x) => x.etat === e).length;
dit('... et chaque matière compte autant de sceaux que la ligne du relevé', [l.faites, l.reservees, l.disponibles], [combien('faite'), combien('reservee'), combien('disponible')]);
dit('... dans l ordre des dates', ['2026-10-06', '2026-10-16', '2026-11-03'], chemin?.slice(0, 3).map((x) => x.date));

/* ── 3. Les branchements ── */
const lis = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const abonnee = lis('src/apps/couronne/Abonnee.tsx');
const ses = lis('src/apps/couronne/SesFormules.tsx');
const tabs = lis('src/apps/couronne/Tabs.tsx');
const css = lis('src/apps/couronne/abonnee.css');
const en = lis('src/apps/couronne/i18n/en-abonnee.ts');
dit('la carte de l accueil pose le chemin du relevé, plus la barre', [true, false],
  [abonnee.includes('<Chemin pas={cheminDeLaLigne(c, l, perdue)} voile={voile} />'), /Barre3/.test(abonnee)]);
dit('le chemin se tait pour un lecteur d écran : la légende le dit en mots', true, /className=\{`ab-chemin [^\n]*aria-hidden="true">/.test(abonnee));
dit('le motif des hachures prend son nom avant toute sortie anticipée', true,
  abonnee.indexOf('const hachures = `ab-h${useId()') > 0 && abonnee.indexOf('const hachures = `ab-h${useId()') < abonnee.indexOf('if (!pas || pas.length === 0) return null;'));
dit('Ma formule : le chemin dans l en-tête de chaque prestation, plus les jetons', [true, false], [ses.includes('<CheminDuPli c={c} l={l} />'), /<Jetons /.test(ses)]);
dit('... trois rubriques par formule : séances, règlement, convenu', [1, 1, 1],
  [':seances`} onBascule', ':reglement`} onBascule', ':convenu`} onBascule'].map((x) => ses.split(x).length - 1));
dit('... « Mes séances » de la première formule s ouvre à l arrivée, une seule rubrique à la fois', [true, true],
  [ses.includes('useState<string | null>(() => (releve.contrats[0] ? `${releve.contrats[0].sub.id}:seances` : null));'), ses.includes('setRubrique((o) => (o === k ? null : k))')]);
dit('... le résumé du règlement dit le reste, ou que tout est réglé', true,
  ses.includes("return ar.resteXof > 0 ? t('Reste {montant}', { montant: prix(ar.resteXof) }) : t('Tout est réglé');"));
dit('... le résumé d une lune dit jusqu à quand elle est réglée, ou qu elle est à régler', [true, true],
  [ses.includes("if (c.etat === 'en-pause' && ar.luneARegler) return t('Lune à régler');"), ses.includes("t('Lune réglée jusqu’au {date}', { date: dateDansLaPhrase(dernierJour(c.lune.au)) })")]);
dit('... le résumé des séances reprend la légende du relevé', true, ses.includes('return <Legende l={l} perdue={lignePerdue(c)} />;'));
dit('une seule alerte en haut de l accueil d une abonnée', true, tabs.includes('{soon && !(abonneeA && releveA?.alerte) && ('));
const bloc = css.slice(css.indexOf('/* LE CHEMIN DE SCEAUX'), css.indexOf("/* Le sceau d'argent"));
dit('les matières ont leur dessin, et la formule voilée le sien', [true, true, true, true],
  ['.ab-pas--faite .ab-pas__fond', '.ab-pas--reservee .ab-pas__fond', '.ab-pas--perdue .ab-pas__fond', '.ab-chemin.is-voile .ab-pas__fond'].map((x) => bloc.includes(x)));
dit('pas de sceau « manquée » : ni dans le chemin, ni dans la feuille, ni dans la légende', [false, false, false],
  [/manquee/.test(lis('src/shared/chemin-de-sceaux-pur.ts').replace(/\/\*[\s\S]*?\*\//g, '')), /ab-pas--manquee|ab-seg--manquee|is-manquee/.test(css), /manqu[ée]e/.test(abonnee.replace(/\/\*[\s\S]*?\*\//g, ''))]);
dit('aucune couleur écrite en dur dans ces styles : le soir suit les jetons', [], bloc.match(/#[0-9A-Fa-f]{3,8}\b|rgba?\(/g) ?? []);
dit('aucun jeton qui n existe que le soir : le chiffre d une perdue se lit aussi de jour', false, /var\(--ink-mute\)/.test(bloc));
dit('le chiffre d une réservée garde son liseré, il se lit sur les hachures', true, /\.ab-pas--reservee \.ab-pas__n \{[^}]*paint-order: stroke; stroke: var\(--surface-card\);/.test(bloc));
dit('ouverte, une rubrique ne répète pas son résumé', true, css.includes('.ab-rub.is-ouverte .ab-rub__resume { display: none; }'));
dit('les trois phrases neuves ont leur anglais', [true, true, true],
  ["'{n} prestations': '{n} services',", "'Lune à régler': 'Moon to pay',", "'Lune réglée jusqu’au {date}': 'Moon paid until {date}',"].map((x) => en.includes(x)));

console.log(ko === 0 ? '\nLe chemin de sceaux tient.' : `\n${ko} ECHEC(S)`);
if (ko) process.exitCode = 1;
