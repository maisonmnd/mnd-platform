/* SES RENDEZ-VOUS, ÉPROUVÉS — `node scripts/verifie-ses-rendez-vous.mjs`.

   24 octobre 2026 : « voir la liste des RDV d'une cliente depuis son RDV
   sans retourner dans le Carnet ; accéder à ses anciens RDV et les modifier
   à tout moment sans changer d'écran » (Yéman). L'ordre et les totaux
   (clients/ses-rendez-vous-pur.ts), l'onglet et la fenêtre par-dessus
   (texte), Échap qui ne ferme que la fenêtre du dessus. Sortie ASCII. */
import { rangeSesRendezVous, totauxDeSesRendezVous, parAnnee } from '../src/apps/trone/routes/clients/ses-rendez-vous-pur';
import { readFileSync } from 'node:fs';

let ko = 0;
let n = 0;
const ascii = (v: unknown): string =>
  (JSON.stringify(v) ?? 'undefined').replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : ` -> ${ascii(obtenu)}`}`);
  if (!ok) console.log(`       attendu ${ascii(attendu)}`);
};
const sansCommentaires = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s+/g, ' ');

const AUJ = '2026-10-24';
const r = (id: string, date: string, time: string, status: string, net = 50000, reste = 0) => ({ id, date, time, status, net, reste });
const rdvs = [
  r('a', '2026-08-01', '10:00', 'honoré', 60000, 0),
  r('b', '2026-10-24', '09:00', 'honoré', 50000, 10000),
  r('c', '2026-10-24', '15:00', 'confirmé', 40000, 40000),
  r('d', '2026-11-05', '10:00', 'confirmé', 45000, 45000),
  r('e', '2026-10-30', '14:00', 'en attente', 30000, 30000),
  r('f', '2026-09-12', '11:00', 'annulé', 50000, 50000),
  r('g', '2026-09-12', '16:00', 'honoré', 55000, 0),
];
const { aVenir, passes } = rangeSesRendezVous(rdvs, AUJ);
dit('a venir : le plus proche en tete ; aujourd hui tant qu il n est pas honore', ['c', 'e', 'd'], aVenir.map((x) => x.id));
dit('passes : le plus recent en tete, l heure departage le meme jour ; un annule reste a sa place', ['b', 'g', 'f', 'a'], passes.map((x) => x.id));
dit('les totaux : nombre, honores, annules, valeur des honores, reste sans les annules',
  { nombre: 7, honores: 3, annules: 1, honoresXof: 165000, resteXof: 125000 },
  totauxDeSesRendezVous(rdvs, (x) => x.net, (x) => x.reste));
dit('une cliente sans rendez-vous : des zeros', { nombre: 0, honores: 0, annules: 0, honoresXof: 0, resteXof: 0 }, totauxDeSesRendezVous([], () => 0, () => 0));

const fenetre = sansCommentaires('src/apps/trone/routes/clients/_shared.tsx');
const ds = sansCommentaires('src/ds/components.tsx');
dit('l onglet « Ses rendez-vous » apparait des qu elle en a un autre que celui-ci', [true, true],
  [fenetre.includes("const montreSiens = !!clientId && sesRdv.some((a) => a.id !== appt?.id);"), fenetre.includes('Ses rendez-vous · {sesRdv.length}')]);
dit('il se montre aussi aux maitres (sans les montants), pas seulement a la direction', [true, true],
  [!/montreSiens = [^;]*estDirection/.test(fenetre), fenetre.includes('sansPrix={!!sansPrix}')]);
dit('une ligne ouvre son rendez-vous PAR-DESSUS, dans un portail, et le fermer ramene ici', [true, true],
  [fenetre.includes('onOuvrir={(a) => setAutre({ appt: a })}'), /createPortal\( <RdvModal appt=\{autre\.appt\} initial=\{autre\.initial\}[^>]*onClose=\{\(\) => setAutre\(null\)\} \/>, document\.body, \)/.test(fenetre)]);
dit('un nouveau rendez-vous pour elle, sans quitter la fenetre', true, fenetre.includes('onNouveau={() => setAutre({ initial: { clientId } })}'));
dit('Echap ne ferme que la fenetre du dessus', true, ds.includes('if (PILE_DES_MODALES[PILE_DES_MODALES.length - 1] !== moi.current) return;'));
dit('les dates disent leur annee', true, fenetre.includes('<span className="trc-siens__quand">{frShortAn(a.date)}'));

/* ANNEE PAR ANNEE (25 octobre 2026) : les passes sur trois ans, coupes a
   chaque changement d annee, sans retrier ; a venir qui passe en janvier. */
{
  const longs = [
    r('p1', '2026-10-23', '09:30', 'honoré'), r('p2', '2026-02-21', '11:00', 'confirmé'), r('p3', '2025-11-27', '11:00', 'honoré'),
    r('p4', '2025-03-28', '09:00', 'honoré'), r('p5', '2024-12-02', '10:00', 'annulé'), r('v1', '2026-12-23', '09:30', 'confirmé'), r('v2', '2027-01-08', '10:00', 'confirmé'),
  ];
  const { aVenir: av, passes: ps } = rangeSesRendezVous(longs, AUJ);
  dit('passes : 2026, 2025, 2024, chaque annee dans l ordre recu', [['2026', ['p1', 'p2']], ['2025', ['p3', 'p4']], ['2024', ['p5']]],
    parAnnee(ps).map((g) => [g.annee, g.rdvs.map((x) => x.id)]));
  dit('a venir : 2026 puis 2027 ; une liste vide ne donne aucune annee', [[['2026', ['v1']], ['2027', ['v2']]], []],
    [parAnnee(av).map((g) => [g.annee, g.rdvs.map((x) => x.id)]), parAnnee([])]);
  dit('la fenetre coupe les deux listes par annee, chaque annee dit ses chiffres ; « celui-ci » remplace « ouvert »', [true, true, true, true], [
    fenetre.includes('<Annees liste={aVenir} />') && fenetre.includes('<Annees liste={passes} />'),
    fenetre.includes('{parAnnee(liste).map(({ annee, rdvs: ceux }) => {'),
    fenetre.includes('const ta = totauxDeSesRendezVous(ceux,'),
    fenetre.includes("{ici ? 'celui-ci' : '›'}") && !fenetre.includes("{ici ? 'ouvert' : '›'}"),
  ]);
}

console.log(`\n${n - ko}/${n} verifications`);
