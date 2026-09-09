/* LA CADENCE D'UNE TÊTE — quand la Maison l'attend, et quand elle ne peut PAS
   l'attendre. Lancé par `node scripts/verifie-cadence.mjs`.

   Deux règles posées le 16 août, sur deux anomalies vues par Yéman :
     ① une estimation ne reste jamais dans le passé — le cycle se rejoue ;
     ② aucune estimation un lundi ni un dimanche — la Maison est fermée. */
import { predictNextVisit, tauxDeRealisation, proposeLaCadence, decaleLaSuite, dateDeLaReprise, RYTHMES_ABO, jourFavoriDe, diraLeJourFavori, litSonJour, diraPourquoiPasDeJour, cadenceObservee, rythmeDeReprise } from '../src/shared/cadence';
import { settingsStore } from '../src/shared/settings';
import type { Appointment } from '../src/shared/agenda';
import type { Client } from '../src/shared/clients';
import { mouvementsDePassage, depuisQuandALaMaison, type TetePassage } from '../src/shared/clients';
import { dureeEnClair } from '../src/apps/trone/routes/clients/_shared';

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

/* ── LA MAIN L'EMPORTE — 6 septembre 2026 ──────────────────────────
   « À côté de "vit ailleurs" : sans locks, visiteur » (Yéman). Le bouton
   « De passage » d'À faire pose la marque sur une tête qui a plusieurs venues,
   et la machine, qui a raison de la lever au retour, l'aurait défaite à la
   passe suivante. Un bouton qui s'annule est pire que pas de bouton.

   Le verrou est le même que `personaFige` et `jourPose` : une décision bat une
   déduction, et la machine se tait sur ce que la main a tranché. */
const pose = mouvementsDePassage(
  [
    tete({ id: 'posee', dePassage: true, passagePose: true }),
    tete({ id: 'posee-sans-souvenir', dePassage: true, passagePose: true }),
    tete({ id: 'deduite', dePassage: true }),
  ],
  venuesFixes({ posee: 5, 'posee-sans-souvenir': 1, deduite: 5 }),
);
dit('la marque posée à la main ne se lève pas', ['deduite'], [...pose.promues]);
/* PAS MÊME UN SOUVENIR : la machine ne récrit rien du tout sur cette fiche. */
dit('… et rien ne s’y écrit', 0, pose.aMemoriser.size);
dit('… ni ne s’y repose', 0, pose.rendues.size);

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
dit('les neuf rythmes de la Maison', [4, 5, 6, 7, 8, 9, 10, 11, 12], [...RYTHMES_ABO]);
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

/* ── LA RÈGLE DU JOUR — 6 septembre 2026 ──────────────────────────
   « Le Trône tranche avec une prédominance des jours favoris selon les
   derniers mois. Il faut écrire une règle pour toujours remplir un jour »
   (Yéman).

   JE M'ABSTENAIS, LA MAISON DEMANDE QU'ON TRANCHE. Le premier moteur laissait
   le champ vide au moindre doute, et presque aucune tête n'avait de jour : la
   prédiction tombait n'importe où, ce qui est PIRE qu'un jour imparfait.

   LE JOUR EST FIXÉ dans le harnais : le poids dépend de l'âge des venues, un
   test qui lirait l'horloge changerait de réponse avec le temps. */
const AUJ = '2026-09-06';
const v = (date: string, status = 'honoré', clientId = 'cl-1') => ({ clientId, date, status });

/* 2026-09-08 est un MARDI ; 2026-09-10 un JEUDI. */
const mardis = [v('2026-09-08'), v('2026-09-15'), v('2026-09-22'), v('2026-09-29')];
dit('quatre mardis font un mardi', { jour: 2, jours: [2], fois: 4, total: 4 }, jourFavoriDe(mardis, 'cl-1', AUJ));

/* TROIS VENUES HONORÉES AVANT DE CONCLURE — arbitrage de la Maison, après un
   premier seuil à quatre. Deux venues ne font pas une prédominance. */
dit('deux venues ne concluent pas', undefined,
  jourFavoriDe([v('2026-09-08'), v('2026-09-15')], 'cl-1', AUJ));
dit('… et l’écran dit combien il en manque',
  '2 venues honorées sur 3. Encore 1 et son jour se lira.',
  diraPourquoiPasDeJour(litSonJour([v('2026-09-08'), v('2026-09-15')], 'cl-1', AUJ)));
dit('trois suffisent', { jour: 2, jours: [2], fois: 3, total: 3 },
  jourFavoriDe([v('2026-09-08'), v('2026-09-15'), v('2026-09-22')], 'cl-1', AUJ));

/* L'ÉGALITÉ SE TRANCHE PAR LA RÉCENCE — le cas de Baké. Deux mardis anciens,
   deux jeudis récents : c'est une tête du jeudi. Quatre venues, donc au-dessus
   du seuil : la règle s'applique. */
dit('l’égalité se tranche par les derniers mois', 4, jourFavoriDe([
  v('2025-03-04'), v('2025-03-11'),
  v('2026-08-06'), v('2026-08-13'),
], 'cl-1', AUJ)?.jour);
/* ET DANS L'AUTRE SENS, pour prouver que ce n'est pas l'ordre qui décide. */
dit('… et dans l’autre sens aussi', 2, jourFavoriDe([
  v('2025-03-06'), v('2025-03-13'),
  v('2026-08-04'), v('2026-08-11'),
], 'cl-1', AUJ)?.jour);

/* UN JOUR DISPERSÉ SE POSE QUAND MÊME : trois mardis sur huit, c'est le plus
   fréquent, et un jour imparfait vaut mieux qu'aucun. */
dit('le plus fréquent gagne, même dispersé', 2, jourFavoriDe([
  v('2026-09-08'), v('2026-09-15'), v('2026-09-22'),
  v('2026-09-09'), v('2026-09-16'),
  v('2026-09-10'), v('2026-09-17'), v('2026-09-11'),
], 'cl-1', AUJ)?.jour);

/* SEULES LES VENUES HONORÉES COMPTENT. Un rendez-vous annulé, ou posé et
   jamais rendu, ne dit pas ce qu'elle aime — il dit le contraire. */
dit('l’annulé ne compte pas', { jour: 2, jours: [2], fois: 3, total: 3 }, jourFavoriDe([
  v('2026-09-08'), v('2026-09-15'), v('2026-09-22'), v('2026-09-10', 'annulé'),
], 'cl-1', AUJ));
dit('… ni le confirmé jamais rendu', { jour: 2, jours: [2], fois: 3, total: 3 }, jourFavoriDe([
  v('2026-09-08'), v('2026-09-15'), v('2026-09-22'), v('2026-09-10', 'confirmé'),
], 'cl-1', AUJ));
/* CELLES D'UNE AUTRE TÊTE NON PLUS. */
dit('la tête voisine ne déteint pas', { jour: 2, jours: [2], fois: 3, total: 3 }, jourFavoriDe([
  v('2026-09-08'), v('2026-09-15'), v('2026-09-22'),
  v('2026-09-10', 'honoré', 'cl-2'),
], 'cl-1', AUJ));

/* SANS AUCUNE VENUE RENDUE, la phrase compte les rendez-vous pour dire que
   l'attente n'est pas une panne. */
dit('sans venue honorée, rien', undefined, jourFavoriDe([
  v('2026-09-08', 'confirmé'), v('2026-09-15', 'annulé'),
], 'cl-1', AUJ));
dit('… et l’écran le dit', '2 rendez-vous, aucun encore honoré. Son jour se lira à sa 3ᵉ venue.',
  diraPourquoiPasDeJour(litSonJour([
    v('2026-09-08', 'confirmé'), v('2026-09-15', 'annulé'),
  ], 'cl-1', AUJ)));
dit('… et sans aucun rendez-vous', 'Aucune venue honorée. Son jour se lira à sa 3ᵉ.',
  diraPourquoiPasDeJour(litSonJour([], 'cl-1', AUJ)));

/* QUAND UN JOUR SE POSE, AUCUNE RAISON — le silence dit que tout va bien. */
dit('un jour posé n’a pas de raison', undefined, litSonJour(mardis, 'cl-1', AUJ).raison);
dit('… et rend le favori', { jour: 2, jours: [2], fois: 4, total: 4 }, litSonJour(mardis, 'cl-1', AUJ).favori);
dit('toujours le même jour se dit ainsi', 'Elle vient toujours le mardi, 4 fois sur 4.',
  diraLeJourFavori({ jour: 2, jours: [2], fois: 4, total: 4 }, 'Mardi'));
dit('un jour dominant se dit ainsi',
  'Elle vient le mardi 6 fois sur 8, et le plus souvent ces derniers mois.',
  diraLeJourFavori({ jour: 2, jours: [2], fois: 6, total: 8 }, 'Mardi'));

/* ET LA REPRISE TOMBE SUR SON JOUR — c'est tout l'objet. */
dit('la reprise tombe sur son mardi', '2026-11-10', dateDeLaReprise('2026-09-09', 8, 2));

/* ── DEPUIS QUAND ELLE EST À LA MAISON — 6 septembre 2026 ─────────
   « Le nombre de jours où le client est dans la Maison dépend du RDV le plus
   ancien dans la plateforme, pas de la date d'inscription. » `since` est la
   date où la FICHE a été créée : la reprise de 2025 l'a rendu criant. */
const fiche = { id: 'cl-1', since: '2026-08-31' };
dit('le carnet fait foi quand il remonte plus loin', '2025-02-19',
  depuisQuandALaMaison(fiche, [{ clientId: 'cl-1', date: '2025-02-19' }, { clientId: 'cl-1', date: '2026-09-04' }]));
/* UNE FICHE PLUS VIEILLE QUE SON PREMIER RITUEL GARDE SA DATE : inscrite en
   janvier, venue en mars, elle est cliente depuis janvier. */
dit('la fiche plus ancienne l’emporte', '2026-08-31',
  depuisQuandALaMaison(fiche, [{ clientId: 'cl-1', date: '2026-09-04' }]));
dit('sans rituel, la fiche seule', '2026-08-31', depuisQuandALaMaison(fiche, []));
/* CELUI D'UNE AUTRE TÊTE NE LA VIEILLIT PAS. */
dit('la tête voisine ne compte pas', '2026-08-31',
  depuisQuandALaMaison(fiche, [{ clientId: 'cl-2', date: '2024-01-01' }]));
dit('sans fiche ni rituel, rien', undefined, depuisQuandALaMaison({ id: 'cl-9', since: '' }, []));

/* ── LE TEMPS ÉCOULÉ, EN CLAIR — 6 septembre 2026 ─────────────────
   « 21 juillet 2015 à aujourd'hui ne fait pas 21. » La case montrait le
   QUANTIÈME du mois, lu par accident du premier mot de la date. */
dit('onze ans se disent en ans', '11 ans', dureeEnClair('2015-07-21', '2026-09-06'));
dit('huit mois se disent en mois', '8 mois', dureeEnClair('2026-01-17', '2026-09-06'));
/* SOUS UN MOIS, LES JOURS : « 0 mois » ne dit rien à personne. */
dit('six jours se disent en jours', '6 j', dureeEnClair('2026-08-31', '2026-09-06'));
/* SOUS DEUX ANS, LES MOIS : « 1 an » pour dix-huit mois efface six mois. */
dit('dix-huit mois restent des mois', '18 mois', dureeEnClair('2025-03-06', '2026-09-06'));
dit('deux ans passent aux ans', '2 ans', dureeEnClair('2024-09-06', '2026-09-06'));
/* UNE DATE À VENIR NE SE COMPTE PAS À REBOURS. */
dit('une date à venir se dit', 'à venir', dureeEnClair('2027-01-01', '2026-09-06'));

/* ── DEUX JOURS FAVORIS — 6 septembre 2026 ────────────────────────
   « Si une cliente a 8 rendez-vous et a fait 4 fois le mardi et 4 fois le
   mercredi, sélectionne les deux. La cadence peut proposer l'un ou l'autre. »
   2026-09-08 est un MARDI, 2026-09-09 un MERCREDI. */
const quatreEtQuatre = [
  v('2026-09-08'), v('2026-09-15'), v('2026-09-22'), v('2026-09-29'),
  v('2026-09-09'), v('2026-09-16'), v('2026-09-23'), v('2026-09-30'),
];
dit('quatre et quatre font deux jours', [2, 3],
  (jourFavoriDe(quatreEtQuatre, 'cl-1', AUJ)?.jours ?? []).slice().sort());
/* SIX CONTRE DEUX N'EN FAIT QU'UN : le second doit peser les trois quarts du
   premier, sinon c'est une exception qu'on prendrait pour une règle. */
dit('six contre deux n’en fait qu’un', [2], jourFavoriDe([
  v('2026-09-08'), v('2026-09-15'), v('2026-09-22'),
  v('2026-09-29'), v('2026-10-06'), v('2026-10-13'),
  v('2026-09-09'), v('2026-09-16'),
], 'cl-1', AUJ)?.jours);
dit('… et la phrase dit les deux', 'Elle vient le mardi ou le mercredi, 8 venues comptées.',
  diraLeJourFavori({ jour: 2, jours: [2, 3], fois: 4, total: 8 }, 'Mardi', 'Mercredi'));

/* ET LA REPRISE TOMBE SUR LE PLUS PROCHE DES DEUX. Un rituel le lundi
   7 septembre, huit semaines : le 2 novembre est un lundi, le mardi 3 vient
   avant le mercredi 4. */
dit('la reprise prend le plus proche des deux', '2026-11-03',
  dateDeLaReprise('2026-09-07', 8, [3, 2]));
dit('… quel que soit l’ordre de la liste', '2026-11-03',
  dateDeLaReprise('2026-09-07', 8, [2, 3]));
/* UN SEUL JOUR CONTINUE DE MARCHER, en nombre comme en liste. */
dit('un jour seul, en nombre', '2026-11-04', dateDeLaReprise('2026-09-07', 8, 3));
dit('… ou en liste d’un', '2026-11-04', dateDeLaReprise('2026-09-07', 8, [3]));

/* ── LA CADENCE OBSERVÉE ET LE RYTHME DE LA REPRISE (9 septembre) ──
   « Que la cadence ne se remplisse plus à la main » : le juge qui la lit,
   et celui qui décide du rythme de la reprise — la main d'abord, l'observée
   sinon, jamais pour une tête de passage sans rythme posé. */
const venue = (date: string, seriesIndex?: number) =>
  ({ clientId: 'obs1', status: 'honoré', date, seriesIndex } as unknown as Appointment);

dit('une seule venue : rien à observer', null, cadenceObservee([venue('2026-06-01')], 'obs1'));
const troisVenues = [venue('2026-06-01'), venue('2026-07-06'), venue('2026-08-08')]; // 35 j puis 33 j
const obsTrois = cadenceObservee(troisVenues, 'obs1');
dit('deux intervalles réguliers : la médiane en jours', 34, obsTrois?.jours);
dit('… dite en semaines, arrondie', 5, obsTrois?.semaines);
dit('… confiance moyenne à deux intervalles', 'moyenne', obsTrois?.confidence);
/* Une série multi-séances compte pour UNE visite : la 2e séance ne crée pas
   un faux intervalle d'une semaine. */
const avecSerie = [venue('2026-06-01'), venue('2026-06-08', 2), venue('2026-07-06')];
dit('la 2e séance d’une série ne compte pas', 35, cadenceObservee(avecSerie, 'obs1')?.jours);
/* Le plancher : venir chaque semaine ne fait pas une cadence de 7 jours. */
const serrees = [venue('2026-06-01'), venue('2026-06-08'), venue('2026-06-15')];
dit('jamais moins de 14 jours', 14, cadenceObservee(serrees, 'obs1')?.jours);
dit('… soit 2 semaines au moins', 2, cadenceObservee(serrees, 'obs1')?.semaines);

const teteLibre = { id: 'obs1' } as unknown as Client;
const teteManuel = { id: 'obs1', rythmeSemaines: 6 } as unknown as Client;
const tetePassage = { id: 'obs1', dePassage: true } as unknown as Client;
dit('la main commande quand elle a posé un rythme', { semaines: 6, observe: false },
  rythmeDeReprise(teteManuel, troisVenues));
dit('sans rythme posé, l’observée prend le relais', { semaines: 5, observe: true },
  rythmeDeReprise(teteLibre, troisVenues));
dit('une tête de passage sans rythme : jamais', null, rythmeDeReprise(tetePassage, troisVenues));
dit('une tête sans locks non plus — le rituel n’a plus d’objet', null,
  rythmeDeReprise({ id: 'obs1', locksDefaits: true } as unknown as Client, troisVenues));
dit('… mais un rythme posé à la main commande, même pour elle',
  { semaines: 6, observe: false },
  rythmeDeReprise({ id: 'obs1', dePassage: true, rythmeSemaines: 6 } as unknown as Client, troisVenues));
dit('sans historique ni rythme : rien à reprendre', null, rythmeDeReprise(teteLibre, [venue('2026-06-01')]));

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} vérification(s) en échec.`);
if (ko > 0) process.exit(1);
