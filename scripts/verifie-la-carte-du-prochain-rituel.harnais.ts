/* LA CARTE « SON PROCHAIN RITUEL », ÉPROUVÉE : 4 novembre 2026.
   `node scripts/verifie-la-carte-du-prochain-rituel.mjs` (et `--prouve`).

   Proposé, validé d'un toucher ; heure prise dite ; une seule confirmation,
   à la fermeture ; le rendez-vous qui existait déjà se montre et se change
   dans sa fiche. Données inventées : le dépôt est public. */
import { readFileSync } from 'node:fs';
import {
  carteNeuve, ceQueDitLaPlace, ceQueDitLeRendezVousDejaLa, ceQuiPartVersElle, gesteSurLaCarte, issueDeLaFermeture, laPlaceDOffice, laRaisonDeLaDate,
  lesHeuresDuJour, lesJoursDUneAutreDate, pastilleDeLaCarte, sansDateDOffice, type EtatDeLaCarte, type GesteDeLaCarte,
} from '../src/shared/carte-du-prochain-rituel-pur';
import type { Proposition } from '../src/apps/trone/routes/clients/rdv-fluide-pur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};

const SAM = { iso: '2026-12-05', heure: '10:00' };
const SAM_1130 = { iso: '2026-12-05', heure: '11:30' };
const MER = { iso: '2026-12-02', heure: '10:00' };
const P = (cle: Proposition['cle'], iso: string, heure: string, pourquoi = ''): Proposition => ({ cle, titre: cle, iso, heure, pourquoi });

/* ── 1. La place d'office ── */
dit('son jour habituel d’abord, sinon sa date, sinon la première ; rien : null',
  ['2026-12-05', '2026-12-02', '2026-11-28', null],
  [
    laPlaceDOffice([P('date', '2026-12-02', '10:00'), P('tot', '2026-11-28', '09:00'), P('jour', '2026-12-05', '10:00')])?.iso ?? null,
    laPlaceDOffice([P('tot', '2026-11-28', '09:00'), P('date', '2026-12-02', '10:00')])?.iso ?? null,
    laPlaceDOffice([P('tot', '2026-11-28', '09:00'), P('autre', '2026-12-09', '10:00')])?.iso ?? null,
    laPlaceDOffice([]),
  ]);
/* Le 2 décembre 2026 est un mercredi (3) ; le 5, un samedi (6). */
dit('sa date qui tombe déjà sur son jour habituel passe devant le même jour une semaine plus tard ; sinon son jour',
  ['2026-12-02', '2026-12-05', '2026-12-05'],
  [
    laPlaceDOffice([P('date', '2026-12-02', '10:00'), P('jour', '2026-12-09', '10:00')], 3)?.iso ?? null,
    laPlaceDOffice([P('date', '2026-12-02', '10:00'), P('jour', '2026-12-05', '10:00')], 6)?.iso ?? null,
    laPlaceDOffice([P('date', '2026-12-02', '10:00'), P('jour', '2026-12-05', '10:00')], null)?.iso ?? null,
  ]);

/* ── 2. Ce que dit la place, et pourquoi cette date ── */
const nomDuJour = (iso: string) => (iso === '2026-12-05' ? 'samedi' : 'mercredi');
dit('son heure prise : dite, l’heure libre la plus proche ; son heure : place libre ; un jour qui ne l’ouvre pas',
  [
    { texte: '10 h est déjà prise chez Expert ce samedi-là : proposé à 11 h 30, l’heure libre la plus proche.', alerte: true },
    { texte: 'Place libre chez Expert, relue à l’instant.', alerte: false },
    { texte: '10 h n’est pas ouverte ce samedi-là : proposé à 11 h 30, l’heure libre la plus proche.', alerte: true },
  ],
  [
    ceQueDitLaPlace({ place: SAM_1130, heureHabituelle: '10:00', maitre: 'Expert', nomDuJour }),
    ceQueDitLaPlace({ place: SAM, heureHabituelle: '10:00', maitre: 'Expert', nomDuJour }),
    ceQueDitLaPlace({ place: SAM_1130, heureHabituelle: '10:00', ouverteCeJour: false, maitre: 'Expert', nomDuJour }),
  ]);
const jourDit = (iso: string) => ({ '2026-12-02': 'mercredi 2 décembre 2026', '2026-12-05': 'samedi 5 décembre 2026', '2026-11-05': 'jeudi 5 novembre 2026' } as Record<string, string>)[iso] ?? iso;
const rituel = { rythmeJours: 28, source: 'rituel' as const, occurrences: 6, vers: '2026-12-02', attendu: '2026-12-02' };
dit('la raison : son rythme lu sur ses venues, puis son jour habituel ; sa date ; une date due déjà passée',
  [
    'Son rythme : environ 4 semaines, lu sur ses 6 dernières venues. Il tombe le mercredi 2 décembre 2026 ; son jour habituel est le samedi.',
    'Son rythme : environ 4 semaines, lu sur ses 6 dernières venues. Le jour où son rythme la ramène.',
    'Son rythme de venue : environ 5 semaines. Il l’attendait le mercredi 2 décembre 2026 : la première date utile.',
  ],
  [
    laRaisonDeLaDate({ rituel, place: P('jour', '2026-12-05', '10:00'), jourDit, sonJour: 'samedi' }),
    laRaisonDeLaDate({ rituel, place: P('date', '2026-12-02', '10:00'), jourDit }),
    laRaisonDeLaDate({ rituel: { ...rituel, source: 'cadence', rythmeJours: 35, vers: '2026-11-05' }, place: P('date', '2026-11-05', '10:00'), jourDit }),
  ]);

/* ── 3. Les gestes ── */
const joue = (e: EtatDeLaCarte, gestes: GesteDeLaCarte[]) => {
  const effets: string[] = [];
  let x = e;
  for (const g of gestes) {
    const r = gesteSurLaCarte(x, g);
    x = r.etat;
    for (const f of r.effets) effets.push(f.genre === 'fermer' ? 'fermer' : `${f.genre}:${'place' in f && f.place ? `${f.place.iso} ${f.place.heure}` : ('rdvId' in f ? f.rdvId : '')}`);
  }
  return { x, effets };
};
const neuve = carteNeuve({ depart: SAM });
dit('neuve : proposée, à valider, rien de posé', [{ texte: 'À valider', ton: 'vide' }, null, false], [pastilleDeLaCarte(neuve), neuve.rdvId, neuve.valide]);

const a = joue(neuve, [{ genre: 'valider', id: 'r1' }, { genre: 'terminer' }]);
dit('valider puis terminer : posé une fois, confirmé une fois, à la fermeture', ['poser:2026-12-05 10:00', 'confirmer:r1', 'fermer'], a.effets);

const b = joue(neuve, [{ genre: 'valider', id: 'r1' }, { genre: 'modifier' }, { genre: 'toucher', place: MER, id: 'r2' }, { genre: 'toucher', place: SAM_1130, id: 'r3' }, { genre: 'terminer' }]);
dit('changé deux fois : le même rendez-vous déplacé, UNE confirmation à la fin, la pastille le dit',
  [['poser:2026-12-05 10:00', 'deplacer:2026-12-02 10:00', 'deplacer:2026-12-05 11:30', 'confirmer:r1', 'fermer'], 'Confirmé · changé'],
  [b.effets, pastilleDeLaCarte(b.x).texte]);

const c = joue(neuve, [{ genre: 'modifier' }, { genre: 'toucher', place: MER, id: 'r9' }]);
dit('toucher une autre place sans avoir validé : la valide et la pose', [['poser:2026-12-02 10:00'], true, 'r9'], [c.effets, c.x.valide, c.x.rdvId]);

const d = joue(neuve, [{ genre: 'terminer' }]);
dit('terminer sans valider : le pied demande, rien ne part', [[], 'demande-fin'], [d.effets, d.x.pied]);
dit('… « Le valider et terminer » : posé, confirmé, fermé', ['poser:2026-12-05 10:00', 'confirmer:r4', 'fermer'], joue(d.x, [{ genre: 'valider-et-terminer', id: 'r4' }]).effets);
dit('… « Terminer sans rendez-vous » : fermé, aucun message', ['fermer'], joue(d.x, [{ genre: 'terminer-sans' }]).effets);

const e = joue(neuve, [{ genre: 'valider', id: 'r1' }, { genre: 'retirer' }]);
dit('retirer un rendez-vous validé se confirme dans le pied', ['demande-retrait', ['poser:2026-12-05 10:00']], [e.x.pied, e.effets]);
const e2 = joue(e.x, [{ genre: 'retirer-oui' }, { genre: 'terminer' }]);
dit('… retiré : effacé, puis fermé sans aucune confirmation', [['retirer:r1', 'fermer'], { texte: 'Aucun', ton: 'vide' }], [e2.effets, pastilleDeLaCarte(e2.x)]);
dit('… « Le garder » : rien ne change', ['rien', true], [joue(e.x, [{ genre: 'retirer-non' }]).x.pied, joue(e.x, [{ genre: 'retirer-non' }]).x.valide]);

const f = joue(neuve, [{ genre: 'valider', id: 'r1' }, { genre: 'modifier' }, { genre: 'toucher', place: MER, id: 'r2' }, { genre: 'revenir' }]);
dit('revenir à la proposition : le même rendez-vous revient à sa place, la pastille redevient « Confirmé »',
  [['poser:2026-12-05 10:00', 'deplacer:2026-12-02 10:00', 'deplacer:2026-12-05 10:00'], 'Confirmé'], [f.effets, pastilleDeLaCarte(f.x).texte]);

const deja = carteNeuve({ depart: SAM, deja: { id: 'ancien', iso: '2026-12-12', heure: '09:00' } });
const g = joue(deja, [{ genre: 'modifier' }, { genre: 'toucher', place: MER, id: 'x' }, { genre: 'retirer' }, { genre: 'terminer' }]);
dit('un rendez-vous déjà là : montré confirmé, changé dans sa fiche, jamais retiré ni reconfirmé d’ici',
  ['Confirmé', ['ouvrir:ancien', 'ouvrir:2026-12-02 10:00', 'fermer'], false, 'rien'], [pastilleDeLaCarte(deja).texte, g.effets, g.x.retire, joue(deja, [{ genre: 'retirer' }]).x.pied]);

const premiere = carteNeuve({ depart: null });
dit('première venue : rien d’office, un toucher pose', [{ texte: 'À poser', ton: 'vide' }, ['poser:2026-12-02 10:00']],
  [pastilleDeLaCarte(premiere), joue(premiere, [{ genre: 'toucher', place: MER, id: 'p1' }]).effets]);
dit('première venue fermée sans toucher : fermée, aucun message', ['fermer'], joue(premiere, [{ genre: 'terminer' }]).effets);
dit('après la fermeture, plus aucun geste ne pose', [], joue(a.x, [{ genre: 'toucher', place: MER, id: 'z' }, { genre: 'valider', id: 'z' }]).effets);

/* ── 4. Le pied et « Une autre date » ── */
const momentDit = (p: { iso: string; heure: string }) => `${jourDit(p.iso)} à ${p.heure === '10:00' ? '10 h' : p.heure}`;
dit('le pied à la fermeture : la confirmation dite, ou aucun message',
  ['Fenêtre fermée. La confirmation part vers Mme A. K. : samedi 5 décembre 2026 à 10 h.', 'Fenêtre fermée sans prochain rendez-vous, aucun message. Perle le lui proposera avant la date de son rythme.'],
  [issueDeLaFermeture(a.x, { qui: 'Mme A. K.', momentDit }), issueDeLaFermeture(e2.x, { qui: 'Mme A. K.', momentDit })]);
const ajoute = (iso: string, n: number) => { const t = new Date(`${iso}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const placesDe = (iso: string) => ({ ferme: new Date(`${iso}T12:00:00Z`).getUTCDay() === 1, heures: iso === '2026-12-03' ? [] : ['10:00'] });
dit('« Une autre date » : les jours ouverts qui ont une place, sans le lundi fermé ni le jour complet',
  ['2026-12-01', '2026-12-02', '2026-12-04', '2026-12-05', '2026-12-06'],
  lesJoursDUneAutreDate({ depuis: '2026-11-30', placesDe, ajouteJours: ajoute, n: 5 }));

/* ── 4 bis. Ce que les écrans ajoutent (4 novembre 2026) ── */
dit('pas de date en grand : première venue, tête de passage ou diaspora sans rythme ; un rythme mesuré la donne',
  [true, false, true, false, false, true],
  [
    sansDateDOffice({ source: 'defaut' }),
    sansDateDOffice({ source: 'cadence' }),
    sansDateDOffice({ source: 'cadence', dePassage: true }),
    sansDateDOffice({ source: 'cadence', diaspora: true, rythmeSurLaFiche: true }),
    sansDateDOffice({ source: 'rituel', dePassage: true }),
    sansDateDOffice({ source: 'defaut', rythmeSurLaFiche: true }),
  ]);
dit('les heures d’un jour : toutes celles du jour, les prises barrées, dans l’ordre',
  [{ heure: '09:00', libre: false }, { heure: '10:00', libre: true }, { heure: '11:30', libre: true }, { heure: '14:00', libre: false }],
  lesHeuresDuJour({ toutes: ['14:00', '09:00', '11:30', '10:00'], libres: ['11:30', '10:00'] }));
const valideeA = joue(neuve, [{ genre: 'valider', id: 'r1' }]).x;
dit('ce qu’elle reçoit : rien avant de valider, une fois à la fermeture, rien de plus pour un rendez-vous déjà là, rien sans numéro',
  ['attend', 'part', 'deja', 'sans-numero', 'rien'],
  [
    ceQuiPartVersElle(neuve, { aUnNumero: true }).genre,
    ceQuiPartVersElle(valideeA, { aUnNumero: true }).genre,
    ceQuiPartVersElle(deja, { aUnNumero: true }).genre,
    ceQuiPartVersElle(valideeA, { aUnNumero: false }).genre,
    ceQuiPartVersElle(e2.x, { aUnNumero: true }).genre,
  ]);
const dateDite = (iso: string) => ({ '2026-10-20': '20 octobre 2026' } as Record<string, string>)[iso] ?? iso;
dit('le rendez-vous déjà là dit d’où il vient',
  ['Posé le 20 octobre 2026 depuis Ma Couronne, confirmé.', 'Posé le 20 octobre 2026 au Trône, en attente de confirmation.', 'Déjà posé, confirmé.'],
  [
    ceQueDitLeRendezVousDejaLa({ creeLe: '2026-10-20T09:12:00.000Z', source: 'couronne', status: 'confirmé', dateDite }),
    ceQueDitLeRendezVousDejaLa({ creeLe: '2026-10-20T09:12:00.000Z', source: 'trone', status: 'en attente', dateDite }),
    ceQueDitLeRendezVousDejaLa({ dateDite }),
  ]);

/* ── 5. La lettre ── */
const pur = readFileSync('src/shared/carte-du-prochain-rituel-pur.ts', 'utf8');
dit('pas de tiret cadratin, pas le mot banni', [false, false], [pur.includes(String.fromCharCode(0x2014)), /\bsalons?\b/i.test(pur)]);

console.log(ko === 0 ? '\nLa carte du prochain rituel tient.' : `\n${ko} ECHEC(S)`);
if (ko) process.exitCode = 1;
