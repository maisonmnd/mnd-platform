/* LA CADENCE D'UNE TÊTE — quand la Maison l'attend, et quand elle ne peut PAS
   l'attendre. Lancé par `node scripts/verifie-cadence.mjs`.

   Deux règles posées le 16 août, sur deux anomalies vues par Yéman :
     ① une estimation ne reste jamais dans le passé — le cycle se rejoue ;
     ② aucune estimation un lundi ni un dimanche — la Maison est fermée. */
import { predictNextVisit, tauxDeRealisation, proposeLaCadence, decaleLaSuite, dateDeLaReprise, RYTHMES_ABO } from '../src/shared/cadence';
import { settingsStore } from '../src/shared/settings';
import type { Appointment } from '../src/shared/agenda';
import type { Client } from '../src/shared/clients';
import { mouvementsDePassage, type TetePassage } from '../src/shared/clients';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* Les heures de la Maison : fermée lundi et dimanche. */
settingsStore.set((s) => ({
  ...s,
  hours: [
    { key: 'lun', open: '08h00', close: '20h30', closed: true },
    { key: 'mar', open: '08h00', close: '20h30', closed: false },
    { key: 'mer', open: '08h00', close: '20h30', closed: false },
    { key: 'jeu', open: '08h00', close: '20h30', closed: false },
    { key: 'ven', open: '08h00', close: '20h30', closed: false },
    { key: 'sam', open: '09h00', close: '20h00', closed: false },
    { key: 'dim', open: '09h00', close: '20h00', closed: true },
  ],
} as never));

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const jourDe = (iso: string) => JOURS[new Date(`${iso}T12:00:00`).getDay()];

const rdv = (date: string, i = 0): Appointment => ({
  id: `a${date}-${i}`, branchId: 'br', clientId: 'c1', serviceIds: ['sv'],
  date, time: '10:00', master: 'Brice', status: 'honoré',
} as Appointment);
const cliente: Client = { id: 'c1', name: 'Prisca', branchId: 'br' } as Client;

/* ── ① LE CYCLE SE REJOUE ───────────────────────────────────────── */
/* Deux venues à 28 jours d'écart, la dernière il y a des mois : l'échéance
   est largement passée, la proposition doit regarder devant. */
const vieilles = [rdv('2026-04-01'), rdv('2026-04-29')];
const c1 = predictNextVisit(vieilles, [cliente], 'c1', '2026-08-16');
dit('la cadence lue est de 28 j', 28, c1.avgDays);
dit('l’estimation ne reste pas dans le passé', true, (c1.iso ?? '') >= '2026-08-16');
/* L'échéance manquée était le 27 mai (29 avril + 28 j) : 81 jours de retard au
   16 août. La proposition regarde devant, le retard regarde derrière — les
   deux comptent, et la fiche les dit tous les deux. */
dit('… et le retard se compte depuis l’échéance manquée', 81, c1.overdueDays);

/* ── ② JAMAIS UN LUNDI NI UN DIMANCHE ───────────────────────────── */
/* Une dernière venue un lundi, cadence 7 j : sans garde, tout tomberait un
   lundi. Vingt cadences éprouvées, du pas de 7 au pas de 30. */
let fermes = 0;
let passees = 0;
for (let pas = 7; pas <= 30; pas += 1) {
  for (let depart = 1; depart <= 28; depart += 1) {
    const d1 = `2026-06-${String(depart).padStart(2, '0')}`;
    const d2 = new Date(`${d1}T12:00:00`);
    d2.setDate(d2.getDate() + pas);
    const iso2 = `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, '0')}-${String(d2.getDate()).padStart(2, '0')}`;
    const c = predictNextVisit([rdv(d1), rdv(iso2, 1)], [cliente], 'c1', '2026-08-16');
    if (!c.iso) continue;
    const j = new Date(`${c.iso}T12:00:00`).getDay();
    if (j === 0 || j === 1) { fermes += 1; if (fermes <= 3) console.log(`       ⚠ ${c.iso} tombe un ${jourDe(c.iso)}`); }
    if (c.iso < '2026-08-16') { passees += 1; if (passees <= 3) console.log(`       ⚠ ${c.iso} est déjà passée`); }
  }
}
dit('672 cadences éprouvées : aucune un lundi ni un dimanche', 0, fermes);
dit('… et aucune dans le passé', 0, passees);

/* ── ③ CELLES QUI NE VIENNENT QUE LE SAMEDI ──────────────────────── */
/* « Il y a des clientes qui ne veulent venir que le samedi. Les prédictions
   doivent toujours aller sur le samedi suivant » (Yéman, 16 août). */
const samedienne: Client = { ...cliente, id: 'c2', jourPrefere: 6 } as Client;
const rdv2 = (date: string, i = 0) => ({ ...rdv(date, i), clientId: 'c2' } as Appointment);

let pasSamedi = 0;
for (let pas = 7; pas <= 40; pas += 1) {
  for (let depart = 1; depart <= 28; depart += 1) {
    const d1 = `2026-06-${String(depart).padStart(2, '0')}`;
    const d2 = new Date(`${d1}T12:00:00`);
    d2.setDate(d2.getDate() + pas);
    const iso2 = `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, '0')}-${String(d2.getDate()).padStart(2, '0')}`;
    const c = predictNextVisit([rdv2(d1), rdv2(iso2, 1)], [samedienne], 'c2', '2026-08-16');
    if (!c.iso) continue;
    if (new Date(`${c.iso}T12:00:00`).getDay() !== 6) {
      pasSamedi += 1;
      if (pasSamedi <= 3) console.log(`       ⚠ ${c.iso} tombe un ${jourDe(c.iso)}`);
    }
  }
}
dit('952 cadences d’une samedienne : toutes un samedi', 0, pasSamedi);

/* Le samedi SUIVANT, jamais le précédent : l'échéance du mercredi 19 août
   donne le samedi 22, pas le 15. */
const c2 = predictNextVisit(
  [rdv2('2026-07-22'), rdv2('2026-08-05', 1)], [samedienne], 'c2', '2026-08-16',
);
dit('échéance mer. 19 août → samedi 22', '2026-08-22', c2.iso);
dit('… et la cadence lue reste la vraie', 14, c2.avgDays);

/* Sans préférence, la même histoire garde sa date d'origine. */
const c2b = predictNextVisit(
  [rdv('2026-07-22'), rdv('2026-08-05', 1)], [cliente], 'c1', '2026-08-16',
);
dit('sans jour préféré, l’estimation ne bouge pas', '2026-08-19', c2b.iso);

/* ── UN VRAI RDV À VENIR N'EST PAS UNE PRÉDICTION ────────────────── */
/* Il s'affiche tel quel, même un jour fermé : c'est un FAIT posé par la
   Maison, pas une proposition du moteur. */
const pris = { ...rdv('2026-08-24'), status: 'confirmé' } as Appointment;
const c3 = predictNextVisit([rdv('2026-04-01'), pris], [cliente], 'c1', '2026-08-16');
dit('un rendez-vous déjà pris passe devant', '2026-08-24', c3.iso);
dit('… et il n’est pas annoncé comme estimé', false, c3.predicted);

/* ── ④ LE TAUX DE RÉALISATION — le juge éprouvé sur son passé ─────
   Il se rejoue sur l'histoire réelle : on doit pouvoir lui faire confiance,
   donc on l'éprouve sur des histoires dont on connaît la réponse. */
const venuesDe = (id: string, dates: string[]) => dates.map((date) => ({ clientId: id, date }));

/* Une tête d'une régularité parfaite : tous les 28 jours, six venues. */
const parfaite = tauxDeRealisation(venuesDe('p', [
  '2026-01-05', '2026-02-02', '2026-03-02', '2026-03-30', '2026-04-27', '2026-05-25',
]));
dit('régularité parfaite : quatre estimations éprouvées', 4, parfaite?.n);
dit('… toutes justes au jour près', 100, parfaite?.dans3);
dit('… écart médian nul', 0, parfaite?.ecartMedian);
dit('… et aucun penchant', 0, parfaite?.biais);

/* Une tête qui prend TOUJOURS une semaine de retard sur sa cadence : le juge
   doit l'avouer — « la Maison l'attend trop tôt ». */
const tardive = tauxDeRealisation(venuesDe('t', [
  '2026-01-05', '2026-02-02', '2026-03-09', '2026-04-20', '2026-06-08',
]));
dit('celle qui traîne : le biais est positif', true, (tardive?.biais ?? 0) > 0);

/* Deux venues seulement : rien à éprouver — il faut un passé pour se juger. */
dit('deux venues : aucune estimation à éprouver', null, tauxDeRealisation(venuesDe('d', ['2026-01-05', '2026-02-02'])));
dit('aucune venue : rien non plus', null, tauxDeRealisation([]));

/* Le seuil du juge est le même que celui de la prédiction : DEUX intervalles
   avant de se prononcer. Trois venues donnent donc UNE estimation éprouvée. */
dit('trois venues : une seule estimation éprouvée', 1,
  tauxDeRealisation(venuesDe('x', ['2026-01-05', '2026-02-02', '2026-03-02']))?.n);

/* ── ⑤ ON NE PRÉDIT PAS LE RETOUR DE QUI VIT AILLEURS ─────────────
   « Sur cette liste beaucoup de personnes de la diaspora — comment on fait
   pour qu'ils n'aient plus de prédictions ? » (Yéman, 16 août). */
const histoire = [rdv('2026-01-06'), rdv('2026-02-03', 1), rdv('2026-03-03', 2)];
dit('une tête ordinaire est bien prédite', true, !!predictNextVisit(histoire, [cliente], 'c1', '2026-08-16').iso);

const parLeChamp: Client = { ...cliente, diaspora: true } as Client;
dit('la diaspora par le CHAMP ne se prédit plus', null,
  predictNextVisit(histoire, [parLeChamp], 'c1', '2026-08-16').iso);

const parLeSegment: Client = { ...cliente, segments: ['Diaspora'] } as Client;
dit('… ni par le SEGMENT, l’ancienne vérité', null,
  predictNextVisit(histoire, [parLeSegment], 'c1', '2026-08-16').iso);

/* MAIS UN RENDEZ-VOUS DÉJÀ PRIS RESTE UN FAIT — elle est au pays, elle vient,
   et l'écran doit le dire. Le garde de la diaspora ne le touche pas. */
const prisDiaspora = { ...rdv('2026-09-05'), status: 'confirmé' } as Appointment;
dit('son rendez-vous déjà pris s’affiche quand même', '2026-09-05',
  predictNextVisit([...histoire, prisDiaspora], [parLeChamp], 'c1', '2026-08-16').iso);

/* ── LA MARQUE « DE PASSAGE » VA DANS LES DEUX SENS (26 août) ──
   Elle ne savait que se lever : une facture supprimée ramenait une tête à UNE
   venue, et elle restait « de la Maison » — les têtes couronnées gonflaient.
   Elle revient maintenant, mais SEULEMENT chez qui l'a déjà portée : une
   nouvelle inscrite n'a aucune venue sans être de passage pour autant, et un
   carnet mal chargé ne doit jamais marquer une fidèle. */
const tete = (o: Partial<TetePassage> & { id: string }): TetePassage => ({ ...o });
const venuesFixes = (n: Record<string, number>) => (id: string) => n[id] ?? 0;

const m = mouvementsDePassage([
  tete({ id: 'revient', dePassage: true }),                       // 2 venues → se lève
  tete({ id: 'retombe', futDePassage: true }),                    // 1 venue, l'a été → revient
  tete({ id: 'nouvelle' }),                                       // 0 venue, jamais → intouchée
  tete({ id: 'fidele', futDePassage: true }),                     // 5 venues → intouchée
  tete({ id: 'ancienne', dePassage: true }),                      // marquée sans souvenir
], venuesFixes({ revient: 2, retombe: 1, nouvelle: 0, fidele: 5, ancienne: 1 }));

dit('elle revient au fauteuil : la marque se lève', ['revient'], [...m.promues]);
dit('sa venue disparaît et elle l’a déjà été : la marque revient', ['retombe'], [...m.rendues]);
dit('une nouvelle inscrite n’est JAMAIS marquée', false, m.rendues.has('nouvelle'));
dit('une fidèle non plus', false, m.rendues.has('fidele'));
dit('une marquée sans souvenir en reçoit un, sans rien changer d’autre', ['ancienne'], [...m.aMemoriser]);

/* Le seuil se respecte des deux côtés : exactement 2 venues suffit à se lever,
   et ne fait jamais retomber. */
const bord = mouvementsDePassage(
  [tete({ id: 'pile', dePassage: true, futDePassage: true }), tete({ id: 'juste', futDePassage: true })],
  venuesFixes({ pile: 2, juste: 2 }),
);
dit('deux venues suffisent à lever la marque', ['pile'], [...bord.promues]);
dit('… et deux venues ne la reposent pas', 0, bord.rendues.size);

/* ── POSER LA SUITE D'UN ABONNEMENT ────────────────────────────────
   « Poser les RDV à venir de chaque abonnement vendu en respectant le rythme de
   4, 6 ou 8 semaines, et donner la liberté de modifier ses dates au besoin »
   (Yéman, 1er septembre 2026).

   La Maison ferme le lundi et le dimanche — réglages posés en tête de ce
   harnais. Le 1er septembre 2026 est un MARDI. */
const suite = proposeLaCadence({
  restes: [{ serviceId: 'sv-reprise', reste: 6 }, { serviceId: 'sv-lavage', reste: 6 }],
  departIso: '2026-09-01', pasJours: 42,
});
dit('six crédits font six séances, pas douze', 6, suite.length);
dit('… espacées de six semaines', ['2026-09-01', '2026-10-13', '2026-11-24', '2027-01-05', '2027-02-16', '2027-03-30'],
  suite.map((x) => x.dateIso));
dit('… et chacune porte les deux prestations', ['sv-reprise', 'sv-lavage'], suite[0].serviceIds);

/* LES CRÉDITS SE POSENT DANS L'ORDRE. Six Reprises et trois soins : les trois
   premières séances portent les deux, les trois suivantes la Reprise seule. */
const inegal = proposeLaCadence({
  restes: [{ serviceId: 'sv-reprise', reste: 6 }, { serviceId: 'sv-soin', reste: 3 }],
  departIso: '2026-09-01', pasJours: 28,
});
dit('le plus grand quota commande le nombre', 6, inegal.length);
dit('… les premières portent les deux', 2, inegal[2].serviceIds.length);
dit('… les suivantes la seule qui reste', ['sv-reprise'], inegal[3].serviceIds);

/* ON NE POSE JAMAIS UN FAUTEUIL PORTE CLOSE. Le 7 septembre 2026 est un lundi ;
   la séance glisse au mardi et l'écran DIT qu'elle a bougé. */
const ferme = proposeLaCadence({
  restes: [{ serviceId: 'sv-reprise', reste: 2 }], departIso: '2026-09-07', pasJours: 28,
});
dit('la porte close repousse au jour ouvert', '2026-09-08', ferme[0].dateIso);
dit('… et le déplacement se dit', true, ferme[0].glissee);

/* SON JOUR À ELLE PASSE AVANT LE RYTHME. Une tête qui ne vient que le samedi
   garde ses samedis : un pas de quarante jours glisserait d'un jour à chaque
   fois, et on lui proposerait un mercredi au troisième rendez-vous. */
const samedis = proposeLaCadence({
  restes: [{ serviceId: 'sv-reprise', reste: 3 }],
  departIso: '2026-09-01', pasJours: 40, jourPrefere: 6,
});
dit('elle garde ses samedis', [6, 6, 6],
  samedis.map((x) => new Date(`${x.dateIso}T12:00:00`).getDay()));

/* ON NE POSE RIEN APRÈS L'ÉCHÉANCE DU PAQUET : un crédit posé au-delà de la
   date de fin serait un rendez-vous que la formule ne couvre plus. */
const borne = proposeLaCadence({
  restes: [{ serviceId: 'sv-reprise', reste: 6 }],
  departIso: '2026-09-01', pasJours: 42, finIso: '2026-12-31',
});
dit('la suite s’arrête à l’échéance', ['2026-09-01', '2026-10-13', '2026-11-24'],
  borne.map((x) => x.dateIso));

/* UNE PRESTATION À VOLONTÉ NE COMMANDE AUCUNE SÉANCE — elle s'ajoute à chacune.
   Seule, elle ne pose rien : sinon on poserait l'infini. */
dit('l’illimité seul ne pose rien', 0,
  proposeLaCadence({ restes: [{ serviceId: 'sv-lavage', reste: null }], departIso: '2026-09-01', pasJours: 28 }).length);
const avecIllimite = proposeLaCadence({
  restes: [{ serviceId: 'sv-reprise', reste: 2 }, { serviceId: 'sv-lavage', reste: null }],
  departIso: '2026-09-01', pasJours: 28,
});
dit('l’illimité s’ajoute à chaque séance', [2, 2], avecIllimite.map((x) => x.serviceIds.length));

/* RIEN À POSER QUAND TOUT EST CONSOMMÉ. */
dit('un paquet épuisé ne propose rien', 0,
  proposeLaCadence({ restes: [{ serviceId: 'sv-reprise', reste: 0 }], departIso: '2026-09-01', pasJours: 28 }).length);

/* DÉCALER TOUTE LA SUITE garde le rythme et repousse les portes closes. Sept
   jours après un mardi font un mardi : le 8 septembre reste ouvert. */
dit('la suite se décale en bloc', ['2026-09-08', '2026-10-20'],
  decaleLaSuite(proposeLaCadence({
    restes: [{ serviceId: 'sv-reprise', reste: 2 }], departIso: '2026-09-01', pasJours: 42,
  }), 7).map((x) => x.dateIso));

/* -- LA REPRISE POSEE A LA CLOTURE — 3 septembre 2026 -------------
   « Lorsque je finis un RDV pour une cliente, est-ce que le RDV suivant selon
   la programmation 4, 6, 8 ou 10 semaines, une fois coche, peut automatiquement
   poser le RDV suivant ? » (Yeman).

   La Maison ferme le lundi et le dimanche — reglages poses en tete de ce
   harnais. Le 1er septembre 2026 est un MARDI. */
dit('les six rythmes de la Maison', [4, 5, 6, 7, 8, 10], [...RYTHMES_ABO]);
/* LE PAS D'UNE SEMAINE EST CELUI DU CHEVEU. Une tete qui revient toutes les
   cinq semaines et qu'on programme a quatre vient trop tot douze fois par an ;
   a six, elle vient trop tard autant de fois. */
dit('cinq semaines apres un mardi', '2026-10-06', dateDeLaReprise('2026-09-01', 5));
dit('sept semaines', '2026-10-20', dateDeLaReprise('2026-09-01', 7));
dit('six semaines apres un mardi', '2026-10-13', dateDeLaReprise('2026-09-01', 6));
dit('quatre semaines', '2026-09-29', dateDeLaReprise('2026-09-01', 4));
dit('dix semaines', '2026-11-10', dateDeLaReprise('2026-09-01', 10));
/* ON NE POSE JAMAIS UN FAUTEUIL PORTE CLOSE. Une semaine apres le dimanche
   6 septembre retombe un dimanche ; le lundi etant ferme aussi, la reprise se
   pose le mardi. Deux jours fermes d'affilee ne font pas reculer d'une
   semaine. */
dit('la porte close repousse la reprise', '2026-09-15', dateDeLaReprise('2026-09-06', 1));
/* SON JOUR A ELLE PASSE AVANT LE RYTHME : une tete qui ne vient que le samedi
   garde ses samedis. */
dit('elle garde son samedi', 6,
  new Date(`${dateDeLaReprise('2026-09-01', 6, 6)}T12:00:00`).getDay());
/* ON COMPTE DEPUIS LE RITUEL, PAS DEPUIS LE CLIC : marquer honore trois jours
   plus tard decalerait la reprise d'autant, et la cadence deriverait d'un mois
   par an sans que personne ne comprenne pourquoi. */
dit('la reprise ne depend que du rituel', dateDeLaReprise('2026-09-01', 6),
  dateDeLaReprise('2026-09-01', 6));

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} vérification(s) en échec.`);
if (ko > 0) process.exit(1);
