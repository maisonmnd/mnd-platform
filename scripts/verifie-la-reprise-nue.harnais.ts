/* UNE REPRISE NAIT NUE, EPROUVE — `node scripts/verifie-la-reprise-nue.mjs`.

   2 octobre 2026 : Vicentia avait deux rendez-vous « payes » le 3 novembre,
   poses par la cloture de deux rituels regles le meme soir, et recevait deux
   confirmations. La reprise recopiait la somme reglee du rituel d'avant, et
   rien n'empechait une seconde reprise a la meme date.

   Le banc rejoue le geste sur le VRAI `poseLaReprise` : encaisser (paidXof
   ecrit), puis honorer, deux fois. */
import { readFileSync } from 'node:fs';
import { sansLaVisite, reprisesARendreNues, CHAMPS_DE_LA_VISITE, pourquoiPasDeRepriseIci, rituelDeLaRepriseEffacee, CLOTURE_JOURS, prochainDejaPose } from '../src/shared/reprise-nue';
import { poseLaReprise } from '../src/apps/trone/routes/clients/actions';
import { appointmentsStore } from '../src/shared/agenda';
import { clientsStore } from '../src/shared/clients';
import { apptPayState } from '../src/apps/trone/routes/clients/_shared';

let ko = 0;
/* LES DATES SE COMPTENT DEPUIS AUJOURD'HUI : `poseLaReprise` lit le vrai jour,
   et un banc aux dates figées se mettrait à mentir seul (2 octobre 2026). */
const ilYa = (n: number): string => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
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
    id, branchId: 'b', clientId: 'vic', serviceIds: [sid], date: ilYa(3), time: '17:30', master: 'Team', status: 'confirmé',
  });
  appointmentsStore.set([
    { ...rituel('h1', 's0', 0), date: ilYa(93), status: 'honoré' },
    { ...rituel('h2', 's0', 0), date: ilYa(58), status: 'honoré' },
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

/* ── 3 bis. UNE REPRISE NE REVIENT PAS TOUTE SEULE (2 octobre 2026) ──
   Shegun : sa reprise du 30 octobre, effacee, revenait a chaque sauvegarde.
   Nathael : un rituel d'il y a cinq semaines, ressaisi, posait un rendez-vous
   pour le lendemain. Rejoue sur le VRAI poseLaReprise. */
{
  const tete = (id: string) => ({ id, branchId: 'b', name: `Tete ${id}`, phone: '+22966000001', city: '', persona: 'p', since: '2025-01-01', segments: [], priceCoef: 1, loyaltyPoints: 0, rythmeSemaines: 4 });
  const rdv = (id: string, clientId: string, date: string, status = 'honoré') => ({ id, branchId: 'b', clientId, serviceIds: ['s1'], date, time: '11:00', master: 'Team', status });
  clientsStore.set([tete('she'), tete('nat')] as never);

  /* Shegun : honoree aujourd'hui, sa reprise se pose ; on l'efface comme le Carnet. */
  appointmentsStore.set([rdv('s1', 'she', ilYa(60)), rdv('s2', 'she', ilYa(30)), rdv('s3', 'she', ilYa(0))] as never);
  const pose = poseLaReprise(appointmentsStore.get().find((a) => a.id === 's3')!);
  dit('Shegun : la cloture du jour pose sa reprise', true, !!pose.pose);
  const reprise = appointmentsStore.get().find((a) => a.repriseDe === 's3')!;
  const marque = rituelDeLaRepriseEffacee(reprise);
  appointmentsStore.set((prev) => prev.filter((x) => x.id !== reprise.id).map((x) => (x.id === marque ? { ...x, repriseRetiree: true } : x)));
  const encore = poseLaReprise(appointmentsStore.get().find((a) => a.id === 's3')!);
  dit('... effacee a la main, la sauvegarde suivante ne la repose PAS', [false, 'sa reprise a été retirée à la main'], [!!encore.pose, encore.raison]);
  dit('... et la tete n a aucun rendez-vous a venir', 0, appointmentsStore.get().filter((a) => a.clientId === 'she' && a.date > ilYa(0)).length);
  dit('... la marque ne passe pas a une reprise future', true, CHAMPS_DE_LA_VISITE.includes('repriseRetiree' as never));

  /* Nathael : un rituel d'il y a cinq semaines, ressaisi aujourd'hui. */
  appointmentsStore.set([rdv('n0', 'nat', ilYa(70)), rdv('n1', 'nat', ilYa(35))] as never);
  const vieux = poseLaReprise(appointmentsStore.get().find((a) => a.id === 'n1')!);
  dit(`Nathael : un rituel de plus de ${CLOTURE_JOURS} jours ne pose rien`, [false, true], [!!vieux.pose, /plus de 14 jours/.test(vieux.raison ?? '')]);
  /* Un rituel recent, mais pas le dernier. */
  appointmentsStore.set([rdv('n0', 'nat', ilYa(40)), rdv('n1', 'nat', ilYa(10)), rdv('n2', 'nat', ilYa(3))] as never);
  const pasLeDernier = poseLaReprise(appointmentsStore.get().find((a) => a.id === 'n1')!);
  dit('... un rituel qui n est pas le dernier ne pose rien', [false, true], [!!pasLeDernier.pose, /plus récent/.test(pasLeDernier.raison ?? '')]);
  dit('... le dernier, lui, pose sa reprise', true, !!poseLaReprise(appointmentsStore.get().find((a) => a.id === 'n2')!).pose);
  dit('la regle pure : un rituel annule ne compte pas comme plus recent', null,
    pourquoiPasDeRepriseIci({ id: 'a', clientId: 'x', date: ilYa(2) }, [{ id: 'b', clientId: 'x', date: ilYa(1), status: 'annulé' }], ilYa(0)));

  /* Les deux chemins de suppression laissent la marque. */
  const sansCom = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const f of ['src/apps/trone/routes/clients/Carnet.tsx', 'src/apps/trone/routes/clients/_shared.tsx']) {
    dit(`${f.split('/').pop()} : supprimer une reprise laisse la marque sur son rituel`, true,
      /rituelDeLaRepriseEffacee\(/.test(sansCom(f)) && /repriseRetiree: true/.test(sansCom(f)));
  }
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

/* ── 4 bis. Un rituel, un seul prochain rendez-vous (4 octobre 2026, Nadège K. :
   chaque paiement repassé reposait un rendez-vous par « Reprogrammer »). ── */
{
  const auj = ilYa(0);
  const rituel = { id: 'n1', clientId: 'cn', date: ilYa(1), status: 'honoré' };
  const suite = { id: 'n2', clientId: 'cn', date: ilYa(-28), status: 'confirmé', repriseDe: 'n1' };
  const autre = { id: 'n3', clientId: 'cn', date: ilYa(-10), status: 'confirmé' };
  dit('sans rien a venir, rien ne bloque', null, prochainDejaPose(rituel, [rituel], auj));
  dit('la suite de ce rituel bloque un second rendez-vous', 'n2', prochainDejaPose(rituel, [rituel, suite], auj)?.id);
  dit('... meme si elle a ete honoree ensuite', 'n2', prochainDejaPose(rituel, [rituel, { ...suite, status: 'honoré' }], auj)?.id);
  dit('un rendez-vous a venir de la tete bloque aussi (le plus proche)', 'n3', prochainDejaPose(rituel, [rituel, { ...suite, repriseDe: undefined }, autre], auj)?.id);
  dit('un rendez-vous annule ou passe ne bloque pas', null, prochainDejaPose(rituel, [rituel, { ...autre, status: 'annulé' }, { ...autre, id: 'n4', date: ilYa(5) }], auj));
  const actions = readFileSync('src/apps/trone/routes/clients/actions.tsx', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  dit('« Reprogrammer » a l encaissement passe par la garde', true,
    /const dejaPose = reschedule \? prochainDejaPose\(appt, appointmentsStore\.get\(\), todayISO\(\)\) : null;\s*if \(reschedule && nextDate && !dejaPose\)/.test(actions));
  dit('... et relie ce qu il pose a son rituel', true, /note: 'Reprogrammé depuis l’encaissement',\s*repriseDe: appt\.id,/.test(actions));
  dit('la reprise de la cloture passe par la meme garde', true, /const aVenir = prochainDejaPose\(appt, tous, todayISO\(\)\);/.test(actions));
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
