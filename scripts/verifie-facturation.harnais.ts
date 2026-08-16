/* TEMPORAIRE — l'invariant qui compte : une pièce PAYÉE suit le rituel, et son
   TOTAL ne bouge pas d'un franc. */
import { alignerFacturesDuRituel } from '../src/apps/trone/routes/clients/_shared';
import { invoicesStore, invoiceTotal, ligneFacture, type Invoice } from '../src/shared/finance';
import type { Appointment } from '../src/shared/agenda';
import type { Service } from '../src/shared/catalog';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const sv = (id: string, name: string, priceXof: number): Service =>
  ({ id, categoryId: 'c', name, palier: 'Fondation', priceXof, sessions: 1, master: '', durationMin: 60, order: 1 } as Service);
const A = sv('a', 'KƆKLƆ™ Essentiel', 10_000);
const B = sv('b', 'SÍNSIN™ Essentielle', 20_000);
const byId = new Map([[A.id, A], [B.id, B]]);

const appt = (ids: string[]): Appointment =>
  ({ id: 'ap1', branchId: 'br', clientId: 'c1', serviceIds: ids, date: '2026-08-01', time: '10:00', master: 'M', status: 'honoré', invoiceId: 'inv1' } as Appointment);

const pose = (lines: Invoice['lines']) => {
  invoicesStore.set(() => [{
    id: 'inv1', branchId: 'br', kind: 'facture', number: 'F-1', clientId: 'c1', date: '2026-08-01',
    lines, globalDiscountPct: 0, theme: 'Aube', status: 'payée',
  } as Invoice]);
};
const piece = () => invoicesStore.get()[0];

/* ── LE CAS DE YÉMAN : une pièce PAYÉE d'UNE ligne aux noms collés ── */
pose([ligneFacture('KƆKLƆ™ Essentiel + SÍNSIN™ Essentielle', 30_000)]);
const avant = invoiceTotal(piece());
alignerFacturesDuRituel(appt(['a']), byId, (s) => s.priceXof); // on retire SÍNSIN du rituel
dit('la pièce payée a suivi le rituel', ['KƆKLƆ™ Essentiel', 'Ajustement · prix consenti ce jour-là'],
  piece().lines.map((l) => l.label));
dit('… et le total n’a pas bougé', avant, invoiceTotal(piece()));

/* ── L'ÉCART DANS L'AUTRE SENS — il se dit en remise ── */
pose([ligneFacture('KƆKLƆ™ Essentiel', 10_000)]);
const avant2 = invoiceTotal(piece());
alignerFacturesDuRituel(appt(['a', 'b']), byId, (s) => s.priceXof); // on AJOUTE SÍNSIN
dit('les deux gestes paraissent', ['KƆKLƆ™ Essentiel', 'SÍNSIN™ Essentielle'],
  piece().lines.map((l) => l.label));
dit('… la remise dit l’écart', 20_000, piece().globalDiscountXof);
dit('… et le total n’a toujours pas bougé', avant2, invoiceTotal(piece()));

/* ── CE QU'ON NE TOUCHE PAS ── */
pose([ligneFacture('Règlement · KƆKLƆ™ Essentiel', 5_000)]);
alignerFacturesDuRituel(appt(['a', 'b']), byId, (s) => s.priceXof);
dit('un règlement partiel ne se détaille pas', 1, piece().lines.length);

pose([ligneFacture('KƆKLƆ™ Essentiel', 10_000), ligneFacture('Huile Kòfí™ 100 ml', 12_000)]);
const avant3 = invoiceTotal(piece());
alignerFacturesDuRituel(appt(['a']), byId, (s) => s.priceXof);
dit('une pièce MIXTE reste entière — le flacon ne disparaît pas',
  ['KƆKLƆ™ Essentiel', 'Huile Kòfí™ 100 ml'], piece().lines.map((l) => l.label));
dit('… et son total non plus', avant3, invoiceTotal(piece()));

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} vérification(s) en échec.`);
if (ko > 0) process.exit(1);
