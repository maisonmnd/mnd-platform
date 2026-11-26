/* REPASSER EN SUGGESTION, ÉPROUVÉ — `node scripts/verifie-repasser-en-suggestion.mjs`.

   26 novembre 2026 : « Comment passer un RDV du mode confirmer à suggérer ? »,
   puis « oui, ajoute Repasser en suggestion, sans message » (Yéman). Le banc
   rejoue la règle pure (quand le bouton se montre, ce que le geste écrit, ce
   que le Trône en dit), le geste sur le magasin, ce que les règles des
   rappels et de la relance en concluent, et lit le serveur et les deux écrans. */
import { readFileSync } from 'node:fs';
import {
  ceQueDitLeRetourEnSuggestion, enSuggestion, estSuggere, peutRepasserEnSuggestion,
} from '../src/shared/rendez-vous-suggere-pur';
import { rappelDeLaVeilleSeTait, suggestionSansOui } from '../src/shared/heures-des-rappels-pur';
import { reprisesAProposer } from '../src/shared/reservation-express';
import { estUnRendezVousPris } from '../src/shared/rendez-vous-pris-pur';
import { repasseEnSuggestion } from '../src/shared/carte-du-prochain-rituel';
import { appointmentsStore, type Appointment } from '../src/shared/agenda';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};
const lit = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

/* Le 26 novembre 2026 à 14 h 00 à Cotonou (13 h 00 UTC). */
const MAINTENANT = Date.parse('2026-11-26T13:00:00.000Z');
const OUI = '2026-11-20T09:00:00.000Z';
const confirme = (x: Record<string, unknown> = {}) => ({
  id: 'r1', branchId: 'b1', clientId: 'c1', clientName: 'Mme F.', date: '2026-12-10', time: '10:00',
  status: 'confirmé', serviceIds: ['s1'], depositXof: 5000, ...x,
});

/* ── 1. Quand le bouton se montre ── */
{
  dit('un confirme a venir avec sa fiche', true, peutRepasserEnSuggestion(confirme(), MAINTENANT));
  dit('deja suggere, sans son oui : non', false, peutRepasserEnSuggestion(confirme({ suggereLe: OUI }), MAINTENANT));
  dit('une suggestion qu elle a confirmee : oui', true, peutRepasserEnSuggestion(confirme({ suggereLe: OUI, confirmeeParLaClienteLe: OUI }), MAINTENANT));
  dit('pris en ligne, en attente : non', false, peutRepasserEnSuggestion(confirme({ suggereLe: OUI, attenduJusquAu: OUI }), MAINTENANT));
  dit('pris en ligne et ferme : non (la base le libererait)', false,
    peutRepasserEnSuggestion(confirme({ suggereLe: OUI, attenduJusquAu: OUI, confirmeeParLaClienteLe: OUI }), MAINTENANT));
  dit('honore : non', false, peutRepasserEnSuggestion(confirme({ status: 'honoré' }), MAINTENANT));
  dit('annule : non', false, peutRepasserEnSuggestion(confirme({ status: 'annulé' }), MAINTENANT));
  dit('en attente : non', false, peutRepasserEnSuggestion(confirme({ status: 'en attente' }), MAINTENANT));
  dit('sans fiche : non', false, peutRepasserEnSuggestion(confirme({ clientId: '' }), MAINTENANT));
  dit('aujourd hui a 13 h 30, passe a Cotonou : non', false, peutRepasserEnSuggestion(confirme({ date: '2026-11-26', time: '13:30' }), MAINTENANT));
  dit('aujourd hui a 14 h 30, a venir a Cotonou : oui', true, peutRepasserEnSuggestion(confirme({ date: '2026-11-26', time: '14:30' }), MAINTENANT));
  dit('hier : non', false, peutRepasserEnSuggestion(confirme({ date: '2026-11-25', time: '18:00' }), MAINTENANT));
  dit('une heure illisible : non', false, peutRepasserEnSuggestion(confirme({ time: '10h' }), MAINTENANT));
  dit('rien : non', false, peutRepasserEnSuggestion(null, MAINTENANT));
}

/* ── 2. Ce que le geste écrit ── */
{
  const le = new Date(MAINTENANT).toISOString();
  const avant = confirme({ suggereLe: OUI, confirmeeParLaClienteLe: OUI, ouiNoteParLeComptoir: true, autreMomentDemandeLe: OUI, note: 'n' });
  const apres = enSuggestion(avant, le) as Record<string, unknown>;
  dit('la marque de la Maison, datee du geste', le, apres.suggereLe);
  dit('la confirmation se tait', true, apres.sansConfirmation);
  dit('son oui tombe', false, 'confirmeeParLaClienteLe' in apres);
  dit('le oui du comptoir tombe', false, 'ouiNoteParLeComptoir' in apres);
  dit('« un autre moment » tombe', false, 'autreMomentDemandeLe' in apres);
  dit('aucune echeance ne se pose', false, 'attenduJusquAu' in apres);
  dit('le reste ne bouge pas', [avant.id, avant.date, avant.time, avant.status, avant.serviceIds, avant.depositXof, avant.note, avant.clientId],
    [apres.id, apres.date, apres.time, apres.status, apres.serviceIds, apres.depositXof, apres.note, apres.clientId]);
  dit('il est suggere', true, estSuggere(apres));
  dit('le bouton ne se remontre pas', false, peutRepasserEnSuggestion(apres, MAINTENANT));
  dit('l avant n est pas touche', OUI, avant.confirmeeParLaClienteLe);
}

/* ── 3. Ce qu'en concluent les rappels, la relance et les portes ── */
{
  const le = new Date(MAINTENANT).toISOString();
  const apres = enSuggestion(confirme(), le) as Record<string, unknown>;
  dit('le rappel de la veille se tait', true, rappelDeLaVeilleSeTait(apres));
  dit('deux heures avant non plus', true, suggestionSansOui(apres));
  dit('la relance de trois jours avant le prend', ['r1'], reprisesAProposer([apres as never], '2026-12-10').map((a) => a.id));
  dit('ce n est plus un rendez-vous pris', false, estUnRendezVousPris(apres, '2026-11-26'));
}

/* ── 4. Ce que le Trône dit ── */
{
  const court = (iso: string) => `[${iso}]`;
  dit('la relance a venir se dit', 'Repassé en suggestion, sans message. Aucun rappel tant qu’elle n’a pas dit oui ; la relance part le [2026-12-07].',
    ceQueDitLeRetourEnSuggestion({ date: '2026-12-10' }, { court, aujourdhui: '2026-11-26' }));
  dit('le jour de la relance est aujourd hui : elle part', 'Repassé en suggestion, sans message. Aucun rappel tant qu’elle n’a pas dit oui ; la relance part le [2026-11-26].',
    ceQueDitLeRetourEnSuggestion({ date: '2026-11-29' }, { court, aujourdhui: '2026-11-26' }));
  dit('trop proche : pas de relance', 'Repassé en suggestion, sans message. Aucun rappel tant qu’elle n’a pas dit oui ; trop proche pour la relance de trois jours avant.',
    ceQueDitLeRetourEnSuggestion({ date: '2026-11-28' }, { court, aujourdhui: '2026-11-26' }));
}

/* ── 5. Le geste sur le magasin ── */
{
  const demain = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  appointmentsStore.set([
    confirme({ id: 'g1', date: demain, time: '10:00', confirmeeParLaClienteLe: OUI }),
    confirme({ id: 'g2', date: demain, time: '11:00', suggereLe: OUI, attenduJusquAu: OUI, confirmeeParLaClienteLe: OUI }),
    confirme({ id: 'g3', date: demain, time: '12:00' }),
  ] as unknown as Appointment[]);
  dit('le geste se fait', true, repasseEnSuggestion('g1'));
  const g1 = appointmentsStore.get().find((a) => a.id === 'g1');
  dit('il est suggere au magasin', true, estSuggere(g1));
  dit('sa confirmation se tait au magasin', true, g1?.sansConfirmation);
  dit('deux fois, rien de plus', false, repasseEnSuggestion('g1'));
  dit('pris en ligne : refuse', false, repasseEnSuggestion('g2'));
  dit('pris en ligne : intact', OUI, appointmentsStore.get().find((a) => a.id === 'g2')?.confirmeeParLaClienteLe);
  dit('le voisin ne bouge pas', false, 'suggereLe' in (appointmentsStore.get().find((a) => a.id === 'g3') ?? {}));
}

/* ── 6. Le serveur et les écrans ── */
{
  const conf = lit('supabase/functions/confirmation-rdv/index.ts');
  dit('confirmation-rdv ne regarde pas un rendez-vous sans confirmation', true,
    conf.includes('const rdvs = candidats.filter((a) => !a.sansConfirmation && '));
  const sql = lit('supabase/migrations/0222_le_rendez_vous_en_attente.sql');
  dit('la base ne libere que ce qui porte une echeance', true, sql.includes("where a.data ? 'attenduJusquAu'"));
  const fiche = lit('src/apps/trone/routes/clients/_shared.tsx');
  dit('la fiche montre le geste sous sa garde', true,
    fiche.includes("status === 'confirmé' && peutRepasserEnSuggestion(rdvDuMagasin, Date.now()) && (") && fiche.includes('toast(repasseEnSuggestion(rdvDuMagasin.id)'));
  const carnet = lit('src/apps/trone/routes/clients/Carnet.tsx');
  dit('le Carnet montre le geste sous sa garde', true,
    carnet.includes('{peutRepasserEnSuggestion(a, Date.now()) && (') && carnet.includes('const fait = repasseEnSuggestion(a.id);'));
  dit('aucun des deux n envoie rien', false, /repasseEnSuggestion[\s\S]{0,400}(envoie|sendWhatsapp|functions\.invoke)/.test(fiche + carnet));
}

console.log(ko ? `\n${ko} ECHEC(S)` : '\nTout tient.');
process.exitCode = ko ? 1 : 0;
