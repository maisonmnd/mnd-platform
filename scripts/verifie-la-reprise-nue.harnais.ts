/* UNE REPRISE NAIT NUE, EPROUVE — `node scripts/verifie-la-reprise-nue.mjs`.

   2 octobre 2026 : Vicentia avait deux rendez-vous « payes » le 3 novembre,
   poses par la cloture de deux rituels regles le meme soir, et recevait deux
   confirmations. La reprise recopiait la somme reglee du rituel d'avant, et
   rien n'empechait une seconde reprise a la meme date.

   Le banc rejoue le geste sur le VRAI `poseLaReprise` : encaisser (paidXof
   ecrit), puis honorer, deux fois. */
import { readFileSync } from 'node:fs';
import { sansLaVisite, reprisesARendreNues, CHAMPS_DE_LA_VISITE, pourquoiPasDeRepriseIci, rituelDeLaRepriseEffacee, CLOTURE_JOURS, prochainDejaPose } from '../src/shared/reprise-nue';
import { poseLaReprise, honorAppointment } from '../src/apps/trone/routes/clients/actions';
import { laCarteSOuvreApresLHonneur } from '../src/shared/carte-du-prochain-rituel';
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

/* ── 3. LA PANNE, ET SA FIN (4 novembre 2026) ──
   Vicentia : deux clotures du meme soir posaient deux reprises. Depuis le
   4 novembre 2026, la cloture ne pose plus rien : la carte « Son prochain
   rituel » propose la suite, validee d'un toucher. Sur le VRAI honorAppointment. */
{
  clientsStore.set([{ id: 'vic', branchId: 'b', name: 'Vicentia A', phone: '+22966000000', city: '', persona: 'p', since: '2025-01-01', segments: [], priceCoef: 1, loyaltyPoints: 0, rythmeSemaines: 5 } as never]);
  const rituel = (id: string, sid: string) => ({
    id, branchId: 'b', clientId: 'vic', serviceIds: [sid], date: ilYa(3), time: '17:30', master: 'Team', status: 'confirmé',
  });
  appointmentsStore.set([
    { ...rituel('h1', 's0'), date: ilYa(93), status: 'honoré' },
    { ...rituel('h2', 's0'), date: ilYa(58), status: 'honoré' },
    rituel('r1', 'styling'), rituel('r2', 'signature'),
  ] as never);
  /* Encaisser : la somme s'ecrit, PUIS il s'honore, comme l'encaissement. */
  const encaisseEtHonore = (id: string, somme: number) => {
    appointmentsStore.set((prev) => prev.map((a) => (a.id === id
      ? { ...a, paidXof: somme, payments: [{ id: `p-${id}`, amountXof: somme, date: '2026-10-02' }] } : a)));
    return honorAppointment(appointmentsStore.get().find((a) => a.id === id)! as never, new Map(), { muet: true });
  };
  const premiere = encaisseEtHonore('r1', 2000);
  const aVenir = () => appointmentsStore.get().filter((a) => a.clientId === 'vic' && a.date > ilYa(0)).length;
  dit('la cloture ne pose plus rien d office : la carte propose', [false, 0], [!!premiere.reprise.pose, aVenir()]);
  encaisseEtHonore('r2', 8000);
  dit('... la seconde cloture du meme soir non plus', 0, aVenir());
  dit('poseLaReprise, que le selecteur de la fenetre appelle encore, ne pose rien et ne dit rien', [{}, 0],
    [poseLaReprise(appointmentsStore.get().find((a) => a.id === 'r1')!), aVenir()]);
}

/* ── 3 bis. QUAND LA CARTE S'OUVRE APRES « HONORE » (4 novembre 2026) ──
   Les gardes de l'ancienne reprise disent desormais QUAND la carte se
   propose au Carnet : Shegun (sa suite effacee a la main ne revient pas),
   Nathael (un rituel d'il y a cinq semaines, ou qui n'est pas le dernier, ne
   la propose pas). Sur la VRAIE porte du Carnet. */
{
  const tete = (id: string) => ({ id, branchId: 'b', name: `Tete ${id}`, phone: '+22966000001', city: '', persona: 'p', since: '2025-01-01', segments: [], priceCoef: 1, loyaltyPoints: 0, rythmeSemaines: 4 });
  const rdv = (id: string, clientId: string, date: string, status = 'honoré', plus: Record<string, unknown> = {}) => ({ id, branchId: 'b', clientId, serviceIds: ['s1'], date, time: '11:00', master: 'Team', status, ...plus });
  clientsStore.set([tete('she'), tete('nat')] as never);

  appointmentsStore.set([rdv('s1', 'she', ilYa(60)), rdv('s2', 'she', ilYa(30)), rdv('s3', 'she', ilYa(0))] as never);
  dit('Shegun : honoree aujourd hui, la carte se propose', true, laCarteSOuvreApresLHonneur('s3'));
  appointmentsStore.set((prev) => prev.map((x) => (x.id === 's3' ? { ...x, repriseRetiree: true } : x)));
  dit('... sa suite retiree a la main, la carte ne revient pas', false, laCarteSOuvreApresLHonneur('s3'));
  appointmentsStore.set([rdv('s1', 'she', ilYa(60)), rdv('s3', 'she', ilYa(0)), rdv('s4', 'she', ilYa(-20), 'confirmé')] as never);
  dit('... un rendez-vous deja pose : la carte ne s ouvre pas (le bandeau le dit)', false, laCarteSOuvreApresLHonneur('s3'));
  appointmentsStore.set([rdv('s3', 'she', ilYa(0)), rdv('s5', 'she', ilYa(-28), 'confirmé', { repriseDe: 's3' })] as never);
  dit('... sa suite deja posee par la carte : elle ne s ouvre pas une seconde fois', false, laCarteSOuvreApresLHonneur('s3'));

  appointmentsStore.set([rdv('n0', 'nat', ilYa(70)), rdv('n1', 'nat', ilYa(35))] as never);
  dit(`Nathael : un rituel de plus de ${CLOTURE_JOURS} jours ne la propose pas`, false, laCarteSOuvreApresLHonneur('n1'));
  appointmentsStore.set([rdv('n0', 'nat', ilYa(40)), rdv('n1', 'nat', ilYa(10)), rdv('n2', 'nat', ilYa(3))] as never);
  dit('... un rituel qui n est pas le dernier non plus', false, laCarteSOuvreApresLHonneur('n1'));
  dit('... le dernier, lui, la propose', true, laCarteSOuvreApresLHonneur('n2'));
  dit('... un rituel absent du carnet ne la propose pas', false, laCarteSOuvreApresLHonneur('n3-absent'));
  dit('la regle pure : un rituel annule ne compte pas comme plus recent', null,
    pourquoiPasDeRepriseIci({ id: 'a', clientId: 'x', date: ilYa(2) }, [{ id: 'b', clientId: 'x', date: ilYa(1), status: 'annulé' }], ilYa(0)));
  dit('la regle pure : une suite retiree a la main se dit', 'sa reprise a été retirée à la main',
    pourquoiPasDeRepriseIci({ id: 'a', clientId: 'x', date: ilYa(0), repriseRetiree: true }, [], ilYa(0)));
  dit('la marque ne passe pas a une suite future', true, CHAMPS_DE_LA_VISITE.includes('repriseRetiree' as never));

  /* Les chemins de suppression laissent la marque : le Carnet, la fenetre,
     et « Pas de prochain rendez-vous » sur la carte. */
  const sansCom = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const f of ['src/apps/trone/routes/clients/Carnet.tsx', 'src/apps/trone/routes/clients/_shared.tsx', 'src/shared/carte-du-prochain-rituel.ts']) {
    dit(`${f.split('/').pop()} : supprimer une suite laisse la marque sur son rituel`, true,
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
  /* 4 novembre 2026 : l'interrupteur « Reprogrammer » d'avant l'encaissement
     est retire ; la carte « Son prochain rituel » passe par la meme garde et
     relie ce qu'elle pose a son rituel. */
  const carte = readFileSync('src/apps/trone/routes/vente/SonProchainRituel.tsx', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const porte = readFileSync('src/shared/carte-du-prochain-rituel.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  dit('l interrupteur « Reprogrammer » n existe plus a l encaissement', [false, false],
    [/\breschedule\b|setReschedule/.test(actions), /Reprogrammer le prochain rendez-vous|Reprogrammé depuis l’encaissement/.test(actions)]);
  dit('la carte passe par la garde, et relie ce qu elle pose a son rituel', [true, true],
    [/return prochainDejaPose\(repere, tous\.filter\(/.test(carte), /repriseDe: rituelId,/.test(carte)]);
  dit('la porte du Carnet passe par la meme garde', true, /!pourquoiPasDeRepriseIci\(rituel, tous, jour\) && !prochainDejaPose\(rituel, tous, jour\)/.test(porte));
}

/* ── 4 ter. On n'honore pas ce qui n'a pas eu lieu (4 octobre 2026, Nadège K. :
   sa reprise du 5 decembre honoree le 3 octobre a pose celle du 6 fevrier,
   honoree a son tour, qui a pose celle du 10 avril). Sur le VRAI honorAppointment. ── */
{
  clientsStore.set([{ id: 'nad', branchId: 'b', name: 'Nadege K', phone: '+22966000002', city: '', persona: 'p', since: '2025-01-01', segments: [], priceCoef: 1, loyaltyPoints: 0, rythmeSemaines: 9 } as never]);
  const rdv = (id: string, date: string, status = 'honoré', repriseDe?: string) => ({ id, branchId: 'b', clientId: 'nad', serviceIds: ['s1'], date, time: '10:00', master: 'Team', status, ...(repriseDe ? { repriseDe } : {}) });
  appointmentsStore.set([rdv('k0', ilYa(126)), rdv('k1', ilYa(63)), rdv('k2', ilYa(0)), rdv('k3', ilYa(-63), 'confirmé', 'k2')] as never);
  const r = honorAppointment(appointmentsStore.get().find((a) => a.id === 'k3')! as never, new Map(), { muet: true });
  dit('une reprise a venir ne s honore pas', 'confirmé', appointmentsStore.get().find((a) => a.id === 'k3')?.status);
  dit('... et ne pose pas de reprise de la reprise', [0, 1], [appointmentsStore.get().filter((a) => a.repriseDe === 'k3').length, appointmentsStore.get().filter((a) => a.repriseDe).length]);
  dit('... elle dit pourquoi', true, /pas encore eu lieu/.test(r.reprise.raison ?? ''));
  dit('la regle pure : un rituel a venir ne pose pas de reprise', true, /pas encore eu lieu/.test(pourquoiPasDeRepriseIci({ id: 'f', clientId: 'x', date: ilYa(-30) }, [], ilYa(0)) ?? ''));
  const shared = readFileSync('src/apps/trone/routes/clients/_shared.tsx', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  dit('le selecteur de la fiche refuse « honore » sur un rituel a venir', true, /if \(chosenStatus === 'honoré' && date > todayISO\(\)\) \{/.test(shared));
  const actions = readFileSync('src/apps/trone/routes/clients/actions.tsx', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  dit('honorAppointment refuse un rituel a venir, pour tous les chemins', true, /\): \{ points: number; reprise: ReprisePosee \} \{\s*if \(appt\.date > todayISO\(\)\) \{/.test(actions));
  /* Honorer sans encaisser emet la facture (« honor and impay to have an invoice generated »). */
  dit('honorer sans encaisser emet la facture quand il reste du', true,
    /export function honoreSansEncaisser[\s\S]*?if \(apptDueXof\(maj, byId\) > 0\) \{\s*const r = factureAEnvoyer\(/.test(actions));
  const carnet = readFileSync('src/apps/trone/routes/clients/Carnet.tsx', 'utf8');
  const dash = readFileSync('src/apps/trone/routes/pilotage/Dashboard.tsx', 'utf8');
  dit('Carnet, tableau de bord et encaissement honorent par honoreSansEncaisser', [true, true, true],
    [/honoreSansEncaisser\(a, byId, tarifsDuRituel\(/.test(carnet), /honoreSansEncaisser\(a, byId, tarifsDuRituel\(/.test(dash), /* 26 octobre 2026 : les deux gestes d'un RDV passé passent par `termine`. */ /const h = honoreSansEncaisser\(appt, byId, tarifsDuRituel\(/.test(actions)]);
}

/* ── 5. Branche ── */
{
  const actions = readFileSync('src/apps/trone/routes/clients/actions.tsx', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  dit('la suite imposee (La Retouche comprise) part de la visite debarrassee', true, /export function laSuiteImposeeDuRituel[\s\S]*?\.\.\.sansLaVisite\(appt\),\s*\.\.\.sansLaPlaceDuJour\(appt\),/.test(actions));
  const shell = readFileSync('src/apps/trone/shell/Shell.tsx', 'utf8');
  dit('la reparation est montee dans le Trone', true, /useReprisesNuesVivant\(\);/.test(shell));
}

console.log(ko === 0 ? '\nUne reprise nait nue, et une tete n en a qu une.' : `\n${ko} controle(s) en echec.`);
process.exit(ko === 0 ? 0 : 1);
