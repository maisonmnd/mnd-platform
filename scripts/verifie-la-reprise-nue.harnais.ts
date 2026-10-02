/* UNE REPRISE NAIT NUE, EPROUVE — `node scripts/verifie-la-reprise-nue.mjs`.

   2 octobre 2026 : Vicentia avait deux rendez-vous « payes » le 3 novembre,
   poses par la cloture de deux rituels regles le meme soir, et recevait deux
   confirmations. La reprise recopiait la somme reglee du rituel d'avant, et
   rien n'empechait une seconde reprise a la meme date.

   Le banc rejoue le geste sur le VRAI `poseLaReprise` : encaisser (paidXof
   ecrit), puis honorer, deux fois. */
import { readFileSync } from 'node:fs';
import { sansLaVisite, reprisesARendreNues, CHAMPS_DE_LA_VISITE } from '../src/shared/reprise-nue';
import { poseLaReprise } from '../src/apps/trone/routes/clients/actions';
import { appointmentsStore } from '../src/shared/agenda';
import { clientsStore } from '../src/shared/clients';
import { apptPayState } from '../src/apps/trone/routes/clients/_shared';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* ── 1. Ce que la reprise ne recopie pas ── */
{
  const visite = {
    id: 'r1', clientId: 'c1', serviceIds: ['s1'], mains: [['Brice']], time: '17:30', discountPct: 15,
    paidXof: 8000, payments: [{ id: 'p', amountXof: 8000, date: '2026-10-01' }], invoiceId: 'f1',
    depositXof: 2000, depositConfirmed: true, discountXof: 1200, gamme: [{ id: 'g' }], priceXof: 8000, note: 'n',
  };
  const nue = sansLaVisite(visite) as Record<string, unknown>;
  dit('ni argent, ni piece, ni acompte, ni remise du jour, ni Gamme, ni prix fige', [], CHAMPS_DE_LA_VISITE.filter((k) => k in nue));
  dit('les gestes et le tarif de la tete passent', { serviceIds: ['s1'], mains: [['Brice']], time: '17:30', discountPct: 15 },
    { serviceIds: nue.serviceIds, mains: nue.mains, time: nue.time, discountPct: nue.discountPct });
  dit('le rituel d avant n est pas touche', 8000, visite.paidXof);
}

/* ── 3. LA PANNE, sur le vrai poseLaReprise ── */
{
  clientsStore.set([{ id: 'vic', branchId: 'b', name: 'Vicentia A', phone: '+22966000000', city: '', persona: 'p', since: '2025-01-01', segments: [], priceCoef: 1, loyaltyPoints: 0, rythmeSemaines: 5 } as never]);
  const rituel = (id: string, sid: string, prix: number) => ({
    id, branchId: 'b', clientId: 'vic', serviceIds: [sid], date: '2026-09-29', time: '17:30', master: 'Team', status: 'confirmé',
  });
  appointmentsStore.set([
    { ...rituel('h1', 's0', 0), date: '2026-07-01', status: 'honoré' },
    { ...rituel('h2', 's0', 0), date: '2026-08-05', status: 'honoré' },
    rituel('r1', 'styling', 2000), rituel('r2', 'signature', 8000),
  ] as never);
  /* Encaisser r1 : la somme s'ecrit, PUIS il s'honore et pose sa reprise. */
  const encaisseEtHonore = (id: string, somme: number) => {
    appointmentsStore.set((prev) => prev.map((a) => (a.id === id
      ? { ...a, paidXof: somme, payments: [{ id: `p-${id}`, amountXof: somme, date: '2026-10-02' }], status: 'honoré' } : a)));
    return poseLaReprise(appointmentsStore.get().find((a) => a.id === id)!);
  };
  const premiere = encaisseEtHonore('r1', 2000);
  dit('la premiere cloture pose sa reprise', true, !!premiere.pose);
  const reprise = appointmentsStore.get().find((a) => a.repriseDe === 'r1');
  dit('LA REPRISE NAIT NUE : aucune somme reglee', [undefined, undefined], [reprise?.paidXof, reprise?.payments]);
  dit('... donc elle n est pas « payee »', 'impayé', reprise ? apptPayState({ ...reprise, priceXof: 2000 }, new Map()) : null);
  const seconde = encaisseEtHonore('r2', 8000);
  /* Garde d'avant le 2 octobre (« elle a deja un rendez-vous a venir ») : elle tient sur un seul poste. */
  dit('la seconde cloture du meme soir ne pose rien', [false, true], [!!seconde.pose, /rendez-vous/.test(seconde.raison ?? '')]);
  dit('... la tete n a qu une reprise', 1, appointmentsStore.get().filter((a) => a.repriseDe).length);
}

/* ── 4. Les reprises deja nees payees se reparent ── */
{
  const avant = { id: 'r1', paidXof: 8000, payments: [{}], depositXof: 2000, depositConfirmed: true, depositConfirmedAt: '2026-09-20', discountXof: 1200 };
  const copiee = { id: 'x1', repriseDe: 'r1', status: 'confirmé', creeLe: '2026-10-01T23:30:00.000Z', paidXof: 8000, depositXof: 2000, depositConfirmed: true, depositConfirmedAt: '2026-09-20', discountXof: 1200 };
  const p = reprisesARendreNues([avant, copiee]);
  dit('la somme, l acompte et la remise recopies sont retires', ['depositConfirmed', 'depositConfirmedAt', 'depositXof', 'discountXof', 'paidXof'], Object.keys(p.get('x1') ?? {}).sort());
  dit('une reprise reglee pour de vrai (journal) n est pas touchee', 0, reprisesARendreNues([avant, { ...copiee, payments: [{}] }]).size);
  dit('une reprise honoree a sa vie : pas touchee', 0, reprisesARendreNues([avant, { ...copiee, status: 'honoré' }]).size);
  dit('un acompte verse POUR la reprise reste', ['discountXof', 'paidXof'], Object.keys(reprisesARendreNues([avant, { ...copiee, depositXof: 3000, depositConfirmedAt: '2026-10-10' }]).get('x1') ?? {}).sort());
  dit('une remise en francs d avant le 1er octobre au soir reste (geste voulu alors)', ['paidXof'],
    Object.keys(reprisesARendreNues([{ ...avant, depositConfirmed: false }, { ...copiee, depositConfirmed: false, creeLe: '2026-09-20T10:00:00.000Z' }]).get('x1') ?? {}).sort());
  dit('une fois nue, plus rien a faire', 0, reprisesARendreNues([avant, { id: 'x1', repriseDe: 'r1', status: 'confirmé' }]).size);
}

/* ── 5. Branche ── */
{
  const actions = readFileSync('src/apps/trone/routes/clients/actions.tsx', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  dit('poseLaReprise part de la visite debarrassee', true, /\.\.\.sansLaVisite\(appt\),/.test(actions));
  const shell = readFileSync('src/apps/trone/shell/Shell.tsx', 'utf8');
  dit('la reparation est montee dans le Trone', true, /useReprisesNuesVivant\(\);/.test(shell));
}

console.log(ko === 0 ? '\nUne reprise nait nue, et une tete n en a qu une.' : `\n${ko} controle(s) en echec.`);
process.exit(ko === 0 ? 0 : 1);
