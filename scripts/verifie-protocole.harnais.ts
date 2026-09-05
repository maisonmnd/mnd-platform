/* CE QUI DOIT SUIVRE UNE COULEUR, ÉPROUVÉ — l'ordre, les états, la grâce.
   Lancé par `node scripts/verifie-protocole.mjs`.

   Le catalogue disait déjà l'ordre dans ses descriptions ; ce harnais tient ce
   que le code en a fait, et surtout le piège : un même soin rendu une fois ne
   doit pas cocher les trois étapes qui le demandent. */
import {
  PROTOCOLE_COULEUR, CODES_COULEUR, GRACE_JOURS,
  derniereCouleur, suivreLeProtocole, protocoleAbsent, SERVICES_PROTOCOLE,
} from '../src/shared/protocoles';
import type { Appointment } from '../src/shared/agenda';
import type { Service } from '../src/shared/catalog';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const sv = (code: string): Service => ({ id: `sv-${code}`, code, name: code } as unknown as Service);
const byId = new Map<string, Service>([
  ['s-couleur', sv('ATL·III·COU·M')],
  ['s-sub', sv('ATL·III·SUB·M')],
  ['s-gbigbi', sv('PLT·40·M')],
  ['s-dandan', sv('PLT·10·M')],
  ['s-wewe', sv('PLT·20·M')],
  ['s-sinsin', sv('ATL·II·SIN·M')],
]);
const rdv = (id: string, date: string, ids: string[], status = 'honoré'): Appointment =>
  ({ id, clientId: 'cl-1', date, serviceIds: ids, status } as unknown as Appointment);

/* ── ① LA COULEUR QUI OUVRE LE PROTOCOLE ──────────────────────────
   Reconnue par son CODE, jamais par son nom : un renommage de prestation ne
   doit pas casser le protocole. */
const agenda = [
  rdv('a1', '2026-03-02', ['s-couleur']),
  rdv('a2', '2026-08-04', ['s-couleur']),
  rdv('a3', '2026-08-20', ['s-gbigbi']),
];
dit('la dernière couleur fait foi', '2026-08-04', derniereCouleur(agenda, 'cl-1', byId)?.date);
dit('la Sublimation en est une aussi', '2026-09-01',
  derniereCouleur([rdv('a4', '2026-09-01', ['s-sub'])], 'cl-1', byId)?.date);
/* UNE COULEUR SEULEMENT PRÉVUE N'A RIEN COMMENCÉ, et une annulée non plus. */
dit('une couleur non honorée n’ouvre rien', undefined,
  derniereCouleur([rdv('a5', '2026-09-01', ['s-couleur'], 'confirmé')], 'cl-1', byId)?.date);
dit('un rituel sans couleur n’ouvre rien', undefined,
  derniereCouleur([rdv('a6', '2026-09-01', ['s-sinsin'])], 'cl-1', byId)?.date);
dit('trois codes ouvrent le protocole', 3, CODES_COULEUR.length);

/* ── ② LES ÉTATS, AU JOUR LE JOUR ─────────────────────────────────
   Couleur le 4 août : reconstruction due le 18, hydratation le 3 septembre,
   purification le 18 septembre. */
const couleur = rdv('a2', '2026-08-04', ['s-couleur']);
const au20 = suivreLeProtocole({ couleur, appts: agenda, byId, aujourdhui: '2026-08-20' });
dit('les trois étapes sont dues aux bons jours',
  ['2026-08-18', '2026-09-03', '2026-09-18'], au20.map((e) => e.dueIso));
dit('la reconstruction rendue le 20 est faite', 'fait', au20[0].etat);
dit('… et le dit de quel jour', '2026-08-20', au20[0].faitLe);
dit('… l’hydratation approche', 'a-venir', au20[1].etat);

/* LA MARGE DE COURTOISIE : un soin attendu le 18 n'est pas « en retard » le 20.
   Une alerte qui crie trop tôt finit par ne plus se lire. */
const sansRien = suivreLeProtocole({ couleur, appts: [couleur], byId, aujourdhui: '2026-08-20' });
dit('sept jours de grâce avant le retard', 'a-poser', sansRien[0].etat);
dit('… au-delà, c’est un retard', 'en-retard',
  suivreLeProtocole({ couleur, appts: [couleur], byId, aujourdhui: '2026-08-30' })[0].etat);
dit('… et la grâce vaut sept jours', 7, GRACE_JOURS);

/* ── ③ LE PIÈGE : UN SOIN, UNE ÉTAPE ──────────────────────────────
   Un DÀNDÀN™ rendu une fois cocherait les trois étapes qui le demandent si
   l'on ne consommait pas le rituel : la Maison croirait avoir donné trois
   soins pour un. */
const troisFoisLeMeme = suivreLeProtocole({
  couleur,
  appts: [couleur, rdv('b1', '2026-09-05', ['s-dandan'])],
  byId,
  aujourdhui: '2026-09-20',
  etapes: [
    { jours: 14, code: 'PLT·10', nom: 'Un', pourquoi: '' },
    { jours: 30, code: 'PLT·10', nom: 'Deux', pourquoi: '' },
    { jours: 45, code: 'PLT·10', nom: 'Trois', pourquoi: '' },
  ],
});
dit('un seul soin ne coche qu’une étape',
  ['fait', 'en-retard', 'a-poser'], troisFoisLeMeme.map((e) => e.etat));

/* CE QUI PRÉCÈDE LA COULEUR NE COMPTE PAS : un soin rendu avant elle n'a pas
   réparé ce qu'elle n'avait pas encore fait. */
const avant = suivreLeProtocole({
  couleur,
  appts: [rdv('b2', '2026-07-20', ['s-gbigbi']), couleur],
  byId,
  aujourdhui: '2026-08-30',
});
dit('un soin d’avant la couleur ne compte pas', 'en-retard', avant[0].etat);

/* ── ④ LE PROTOCOLE AU CATALOGUE ──────────────────────────────────
   Trois lignes, une par longueur, comme le reste du Plateau. */
dit('trois longueurs', 3, SERVICES_PROTOCOLE.length);
dit('… chacune porte les trois soins', [3, 3, 3],
  SERVICES_PROTOCOLE.map((s) => (s.includes ?? []).length));
dit('… et le mi-long vaut 68 000 F', 68_000,
  SERVICES_PROTOCOLE.find((s) => s.name.includes('Mi-Long'))?.priceXof);
dit('catalogue vide : les trois manquent', 3, protocoleAbsent([]));
dit('posé, plus rien ne manque', 0, protocoleAbsent(SERVICES_PROTOCOLE));
dit('le protocole compte trois étapes', 3, PROTOCOLE_COULEUR.length);

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} ÉCHEC(S).`);
process.exit(ko === 0 ? 0 : 1);
