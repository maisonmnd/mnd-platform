/* LA TRACE DE LA BASE, ÉPROUVÉE — `node scripts/verifie-traces.mjs`.

   Un geste mal nommé accuse la mauvaise personne ; une mise à jour
   automatique comptée comme un geste lui attribue ce qu'elle n'a pas fait ;
   un geste sensible qui passe inaperçu ne se discute jamais. */
import {
  appareilDit, litLeGeste, resumeParPersonne, estAutomatique, piecesDuRendezVous, piecesDeLaFacture,
  cleDeLaMain, nomDeLaMain, initiales,
  type ContexteDeLecture, type Trace,
} from '../src/shared/traces';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* ── ① L'APPAREIL ─────────────────────────────────────────────────── */
const ANDROID = 'Mozilla/5.0 (Linux; Android 13; SM-A135F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36';
const WINDOWS_EDGE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36 Edg/116.0.1938.69';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const TABLETTE = 'Mozilla/5.0 (Linux; Android 12; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36';
dit('un téléphone Android, Chrome', 'téléphone Android, Chrome', appareilDit(ANDROID));
dit('Edge se reconnaît malgré « Chrome » dans son en-tête', 'ordinateur Windows, Edge', appareilDit(WINDOWS_EDGE));
dit('un iPhone, malgré « Mac OS X »', 'iPhone, Safari', appareilDit(IPHONE));
dit('une tablette Android', 'tablette Android, Chrome', appareilDit(TABLETTE));
dit('en court, la famille seule', ['Android', 'Windows', 'iPhone'], [appareilDit(ANDROID, { court: true }), appareilDit(WINDOWS_EDGE, { court: true }), appareilDit(IPHONE, { court: true })]);
dit('sans en-tête, on le dit', 'appareil inconnu', appareilDit(null));
dit('un service serveur n’est pas un téléphone', 'un service de la Maison', appareilDit('Deno/1.40.0'));

/* ── ② LES MAINS ─────────────────────────────────────────────────── */
dit('le nom figé par la base', 'Rita G.', nomDeLaMain({ porte: 'trone', compteNom: 'Rita G.', compteMail: 'rita@exemple.bj' }));
dit('à défaut, l’e-mail du compte', 'rita@exemple.bj', nomDeLaMain({ porte: 'trone', compteNom: '', compteMail: 'rita@exemple.bj' }));
dit('une cliente de Ma Couronne', 'La cliente', nomDeLaMain({ porte: 'couronne' }));
dit('les initiales', ['RG', 'KO'], [initiales('Rita G.'), initiales('koffi')]);

/* ── ③ LE GESTE, NOMMÉ ──────────────────────────────────────────── */
const ctx: ContexteDeLecture = {
  nomDePrestation: (id) => ({ s1: 'SÍNSIN™ Essentiel', s2: 'DÀNDÀN™' } as Record<string, string>)[id],
  nomDeMembre: (id) => ({ awa: 'Awa D.', sena: 'Sènan H.' } as Record<string, string>)[id],
  argent: (n) => `${n} F`,
};
let n = 0;
const trace = (o: Partial<Trace>): Trace => ({
  id: ++n, faitLe: '2026-09-13T10:42:00Z', table: 'appointments', pieceId: 'r1', operation: 'modifie',
  compte: 'u-rita', compteMail: 'rita@exemple.bj', compteNom: 'Rita G.', porte: 'trone', appareil: ANDROID,
  avant: null, apres: null, ...o,
});

const pose = litLeGeste(trace({
  operation: 'pose',
  apres: { date: '2026-09-13', time: '09:00', status: 'confirmé', serviceIds: ['s1', 's2'], master: 'Awa D.', clientName: 'A. K.', source: 'trone', creeLe: 'x' },
}), ctx);
dit('la création d’un rendez-vous', ['Créé', 'a posé le rendez-vous', 'pose'], [pose.verbe, pose.phrase, pose.famille]);
dit('… avec ses champs lisibles, sans bruit de machine', ['Cliente', 'Date', 'Heure', 'Statut', 'Prestations', 'Maître'], pose.diff.map((d) => d.champ));
dit('… les prestations par leur nom, la date en clair', ['SÍNSIN™ Essentiel · DÀNDÀN™', '13 sept. 2026'],
  [pose.diff.find((d) => d.champ === 'Prestations')?.apres, pose.diff.find((d) => d.champ === 'Date')?.apres]);

const heure = litLeGeste(trace({ avant: { time: '09:00', status: 'confirmé', date: '2026-09-13' }, apres: { time: '10:30', status: 'confirmé', date: '2026-09-13' } }), ctx);
dit('déplacer l’heure', ['Déplacé', [{ champ: 'Heure', avant: '09:00', apres: '10:30' }]], [heure.verbe, heure.diff]);

const honore = litLeGeste(trace({ avant: { status: 'confirmé' }, apres: { status: 'honoré' } }), ctx);
dit('honorer', ['Honoré', true, false], [honore.verbe, honore.honore, honore.sensible]);

const recul = litLeGeste(trace({ avant: { status: 'honoré' }, apres: { status: 'confirmé' } }), ctx);
dit('un statut qui recule est sensible', ['Dés-honoré', true], [recul.verbe, recul.sensible]);

const remise = litLeGeste(trace({ avant: { status: 'honoré' }, apres: { status: 'honoré', discountXof: 2000 } }), ctx);
dit('une remise est sensible, et comptée', ['Remise', true, 2000], [remise.verbe, remise.sensible, remise.remiseXof]);

const mains = litLeGeste(trace({ avant: { serviceIds: ['s1'], mains: [[]] }, apres: { serviceIds: ['s1'], mains: [['awa', 'sena']] } }), ctx);
dit('les mains, nommées par prestation', ['Mains', 'SÍNSIN™ Essentiel : Awa D., Sènan H.'], [mains.verbe, mains.diff[0]?.apres]);

const acompte = litLeGeste(trace({ avant: { depositConfirmed: false }, apres: { depositConfirmed: true } }), ctx);
dit('l’acompte confirmé est un geste d’argent', ['Acompte', 'argent'], [acompte.verbe, acompte.famille]);

const facture = litLeGeste(trace({
  table: 'invoices', pieceId: 'f1', operation: 'pose',
  apres: { number: 'FA-2026-0412', status: 'payée', clientName: 'A. K.', payments: [{ id: 'p1', amountXof: 10000, method: 'espèces', cashbox: 'Caisse du salon' }] },
}), ctx);
dit('une facture née avec son versement', ['Créée', 'a créé la facture et encaissé 10000 F', 10000], [facture.verbe, facture.phrase, facture.encaisseXof]);
dit('… le versement dit sa caisse et son moyen', '10000 F · espèces · Caisse du salon', facture.diff.find((d) => d.champ === 'Versement')?.apres);

const second = litLeGeste(trace({
  table: 'invoices', pieceId: 'f1',
  avant: { status: 'envoyée', number: 'FA-1', payments: [{ id: 'p1', amountXof: 10000 }] },
  apres: { status: 'payée', number: 'FA-1', payments: [{ id: 'p1', amountXof: 10000 }, { id: 'p2', amountXof: 5000, method: 'Mobile Money' }] },
}), ctx);
dit('un second versement s’encaisse, sans recompter le premier', ['Encaissé', 5000], [second.verbe, second.encaisseXof]);

const payeeModifiee = litLeGeste(trace({
  table: 'invoices', pieceId: 'f1',
  avant: { status: 'payée', number: 'FA-1', payments: [{ id: 'p1', amountXof: 10000, method: 'espèces', cashbox: 'Caisse du salon' }] },
  apres: { status: 'payée', number: 'FA-1', payments: [{ id: 'p1', amountXof: 10000, method: 'Mobile Money', cashbox: 'KkiaPay' }] },
}), ctx);
dit('une facture payée qu’on retouche est sensible', ['Payée, modifiée', true, 0], [payeeModifiee.verbe, payeeModifiee.sensible, payeeModifiee.encaisseXof]);
dit('… et le versement dit d’où il est parti', { champ: 'Versement', avant: '10000 F · espèces · Caisse du salon', apres: '10000 F · Mobile Money · KkiaPay' },
  payeeModifiee.diff.find((d) => d.champ === 'Versement'));

const deplace = litLeGeste(trace({
  table: 'invoices', pieceId: 'f2',
  avant: { status: 'envoyée', payments: [{ id: 'p1', amountXof: 10000, cashbox: 'A' }] },
  apres: { status: 'envoyée', payments: [{ id: 'p1', amountXof: 10000, cashbox: 'B' }] },
}), ctx);
dit('un versement déplacé d’une caisse à l’autre est sensible', ['Versement déplacé', true], [deplace.verbe, deplace.sensible]);

const retire = litLeGeste(trace({
  table: 'invoices', pieceId: 'f2',
  avant: { status: 'envoyée', payments: [{ id: 'p1', amountXof: 10000 }, { id: 'p2', amountXof: 3000 }] },
  apres: { status: 'envoyée', payments: [{ id: 'p1', amountXof: 10000 }] },
}), ctx);
dit('un versement retiré est sensible', ['Versement retiré', true], [retire.verbe, retire.sensible]);

const supprime = litLeGeste(trace({ operation: 'efface', avant: { date: '2026-09-20', clientName: 'M. S.', status: 'confirmé' } }), ctx);
dit('une suppression est sensible, la pièce reste lisible', ['Supprimé', true, 'M. S.'], [supprime.verbe, supprime.sensible, supprime.diff.find((d) => d.champ === 'Cliente')?.avant]);

const tel = litLeGeste(trace({ table: 'clients', pieceId: 'c1', avant: { name: 'A. K.', phone: '01 00' }, apres: { name: 'A. K.', phone: '01 99' } }), ctx);
dit('un téléphone de fiche changé est sensible', ['Téléphone changé', true], [tel.verbe, tel.sensible]);

const persona = trace({ table: 'clients', pieceId: 'c1', avant: { name: 'A. K.', persona: 'initie', segments: ['a'] }, apres: { name: 'A. K.', persona: 'fidele', segments: ['b'] } });
dit('une réécriture de persona est automatique, jamais un geste de la personne', [true, 'Automatique'], [estAutomatique(persona), litLeGeste(persona, ctx).verbe]);

const depense = litLeGeste(trace({ table: 'expenses', pieceId: 'e1', avant: { label: 'Gants', amountXof: 5000 }, apres: { label: 'Gants', amountXof: 50000 } }), ctx);
dit('le montant d’une dépense changé est sensible', ['Montant changé', true], [depense.verbe, depense.sensible]);

dit('aucune ligne affichée ne porte de tiret cadratin', false,
  [pose, heure, facture, payeeModifiee, supprime].some((g) => JSON.stringify(g).includes('—')));

/* ── ④ QUI FAIT QUOI ────────────────────────────────────────────── */
const koffi = { compte: 'u-koffi', compteMail: 'koffi@exemple.bj', compteNom: 'Koffi A.', appareil: WINDOWS_EDGE };
const journee: Trace[] = [
  trace({ operation: 'pose', apres: { status: 'confirmé', date: '2026-09-13' } }),
  trace({ pieceId: 'r2', operation: 'pose', apres: { status: 'confirmé', date: '2026-09-13' } }),
  trace({ avant: { status: 'confirmé' }, apres: { status: 'honoré' } }),
  trace({ table: 'invoices', pieceId: 'f1', operation: 'pose', apres: { number: 'F1', payments: [{ id: 'p1', amountXof: 10000 }] } }),
  trace({ ...koffi, avant: { status: 'honoré' }, apres: { status: 'honoré', discountXof: 2000 } }),
  trace({ ...koffi, pieceId: 'r9', operation: 'efface', avant: { status: 'confirmé' } }),
  persona,
  trace({ porte: 'couronne', compte: 'u-cliente', compteMail: 'cliente@exemple.bj', compteNom: 'Une cliente', pieceId: 'r5', operation: 'pose', apres: { status: 'en attente' } }),
];
const resume = resumeParPersonne(journee, ctx);
const rita = resume.find((l) => l.nom === 'Rita G.')!;
const k = resume.find((l) => l.nom === 'Koffi A.')!;
dit('Rita : deux créés, un honoré, une facture, 10 000 F, la persona à part',
  [2, 1, 1, 1, 10000, 0, 1, ['Android']],
  [rita.rdvCrees, rita.rdvModifies, rita.honores, rita.factures, rita.encaisseXof, rita.sensibles, rita.automatiques, rita.appareils]);
dit('Koffi : une remise de 2 000 F, une suppression, deux gestes sensibles',
  [1, 2000, 1, 2, ['Windows']], [k.remises, k.remiseXof, k.suppressions, k.sensibles, k.appareils]);
dit('les clientes se regroupent sous Ma Couronne', ['Clientes · Ma Couronne', 1],
  (() => { const c = resume.find((l) => l.porte === 'couronne')!; return [c.nom, c.rdvCrees]; })());
dit('une personne = un compte', 'c:u-rita', cleDeLaMain(journee[0]));

/* ── ⑤ LES PIÈCES LIÉES ─────────────────────────────────────────── */
dit('la vie d’un rendez-vous porte ses factures', [
  { table: 'appointments', id: 'r1' }, { table: 'invoices', id: 'f1' }, { table: 'invoices', id: 'f2' }, { table: 'invoices', id: 'f3' },
], piecesDuRendezVous({ id: 'r1', invoiceId: 'f1', payments: [{ invoiceId: 'f2' }] }, [{ id: 'f3', apptId: 'r1' }, { id: 'f9', apptId: 'r7' }]));
dit('la vie d’une facture porte son rituel', [{ table: 'invoices', id: 'f2' }, { table: 'appointments', id: 'r1' }],
  piecesDeLaFacture({ id: 'f2' }, [{ id: 'r1', payments: [{ invoiceId: 'f2' }] }, { id: 'r2' }]));

if (ko) {
  console.log(`\n${ko} échec(s).`);
  process.exit(1);
}
console.log('\nLa trace de la base tient.');
